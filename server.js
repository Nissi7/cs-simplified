const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const APP_DATA_DIR = path.join(__dirname, "data");
const PERSISTENT_DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : APP_DATA_DIR;
const SEED_PATH = path.join(APP_DATA_DIR, "seed.json");
const STORE_PATH = path.join(PERSISTENT_DATA_DIR, "store.json");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const ALLOWED_STATUSES = ["new", "assigned", "waiting_on_customer", "resolved", "closed"];
const STATUS_REACTIONS = {
  new: [],
  assigned: ["eyes"],
  waiting_on_customer: ["speech_balloon"],
  resolved: ["white_check_mark"],
  closed: ["white_check_mark"]
};

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function ensureDataDirectoryExists() {
  if (!fs.existsSync(PERSISTENT_DATA_DIR)) {
    fs.mkdirSync(PERSISTENT_DATA_DIR, { recursive: true });
  }
}

function ensureStoreExists() {
  ensureDataDirectoryExists();
  if (!fs.existsSync(STORE_PATH)) {
    writeJson(STORE_PATH, readJson(SEED_PATH));
  }
}

function readStore() {
  ensureStoreExists();
  return readJson(STORE_PATH);
}

function writeStore(store) {
  writeJson(STORE_PATH, store);
}

function resetStore() {
  const seed = readJson(SEED_PATH);
  writeStore(seed);
  return seed;
}

function nextId(store, key) {
  store.lastIds[key] += 1;
  return store.lastIds[key];
}

function slugifyName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "customer";
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES[extension] || "application/octet-stream";

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    response.writeHead(200, { "Content-Type": type });
    response.end(data);
  });
}

function collectRequestBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        request.destroy();
        reject(new Error("Payload too large"));
      }
    });

    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON payload"));
      }
    });

    request.on("error", reject);
  });
}

function findConversation(store, conversationId) {
  return store.conversations.find((item) => item.id === conversationId);
}

function findSlackThread(store, slackThreadId) {
  return store.slackThreads.find((item) => item.id === slackThreadId);
}

function addStatusEvent(store, conversationId, oldStatus, newStatus, changedBy, changeSource) {
  store.statusEvents.push({
    id: nextId(store, "statusEvent"),
    conversationId,
    oldStatus,
    newStatus,
    changedBy,
    changeSource,
    createdAt: nowIso()
  });
}

function syncSlackThreadState(store, conversation) {
  const thread = findSlackThread(store, conversation.slackThreadId);
  if (!thread) {
    return;
  }

  thread.threadStatus = conversation.status === "closed" ? "closed" : "open";
  thread.reactions = STATUS_REACTIONS[conversation.status] || [];
  thread.closedAt = conversation.status === "closed" ? conversation.closedAt : null;
}

function applyStatusChange(
  store,
  conversation,
  newStatus,
  changedBy = "system",
  changeSource = "system"
) {
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    throw new Error(`Unsupported status: ${newStatus}`);
  }

  const oldStatus = conversation.status;
  if (oldStatus === newStatus) {
    syncSlackThreadState(store, conversation);
    return false;
  }

  conversation.status = newStatus;

  if (newStatus === "resolved") {
    conversation.resolvedAt = nowIso();
    conversation.closedAt = null;
  } else if (newStatus === "closed") {
    conversation.closedAt = nowIso();
  } else {
    conversation.resolvedAt = null;
    conversation.closedAt = null;
  }

  addStatusEvent(store, conversation.id, oldStatus, newStatus, changedBy, changeSource);
  syncSlackThreadState(store, conversation);
  return true;
}

function addMessage(store, conversationId, authorType, direction, body, source, sourceLink) {
  const message = {
    id: nextId(store, "message"),
    conversationId,
    authorType,
    direction,
    body: body.trim(),
    source,
    sourceLink: String(sourceLink || "").trim(),
    createdAt: nowIso()
  };

  store.messages.push(message);
  return message;
}

function addDelivery(store, conversationId, targetSource, status, payloadSummary) {
  const delivery = {
    id: nextId(store, "delivery"),
    conversationId,
    targetSource,
    status,
    payloadSummary,
    createdAt: nowIso()
  };

  store.deliveries.push(delivery);
  return delivery;
}

function findCustomerByIdentity(store, payload) {
  const normalizedName = String(payload.customerName || "").trim().toLowerCase();
  const normalizedEmail = String(payload.email || "").trim().toLowerCase();
  const normalizedPhone = String(payload.phone || payload.handle || "").trim();
  const normalizedHandle = String(payload.handle || "").trim().toLowerCase();

  return store.customers.find((customer) => {
    const handles = customer.handles || [];
    const hasHandle = handles.some(
      (item) =>
        item.source === payload.source &&
        String(item.value).trim().toLowerCase() === normalizedHandle
    );

    return (
      (normalizedEmail && String(customer.email || "").toLowerCase() === normalizedEmail) ||
      (normalizedPhone && String(customer.phone || "") === normalizedPhone) ||
      (normalizedHandle && hasHandle) ||
      (normalizedName && customer.name.toLowerCase() === normalizedName)
    );
  });
}

function ensureCustomer(store, payload) {
  const existing = findCustomerByIdentity(store, payload);
  if (existing) {
    const incomingHandle = String(payload.handle || "").trim();
    const hasHandle = (existing.handles || []).some(
      (item) =>
        item.source === payload.source &&
        String(item.value).trim().toLowerCase() === incomingHandle.toLowerCase()
    );

    if (incomingHandle && !hasHandle) {
      existing.handles.push({
        source: payload.source,
        value: incomingHandle
      });
    }

    if (payload.email && !existing.email) {
      existing.email = payload.email.trim();
    }

    if (payload.phone && !existing.phone) {
      existing.phone = payload.phone.trim();
    }

    return existing;
  }

  const customer = {
    id: nextId(store, "customer"),
    name: payload.customerName.trim(),
    email: String(payload.email || "").trim() || `${slugifyName(payload.customerName)}@pending.local`,
    phone: String(payload.phone || payload.handle || "").trim() || "Not provided",
    tier: "standard",
    handles: payload.handle
      ? [{ source: payload.source, value: payload.handle.trim() }]
      : [],
    slackChannelId: null,
    createdAt: nowIso()
  };

  store.customers.push(customer);
  return customer;
}

function ensureSlackChannel(store, customer) {
  if (customer.slackChannelId) {
    return store.slackChannels.find((item) => item.id === customer.slackChannelId);
  }

  const slackChannelId = nextId(store, "slackChannel");
  const slackChannel = {
    id: slackChannelId,
    name: `acct-${slugifyName(customer.name)}-slack`,
    externalChannelId: `C${String(100000 + slackChannelId).padStart(6, "0")}`,
    customerId: customer.id,
    createdAt: nowIso()
  };

  customer.slackChannelId = slackChannel.id;
  store.slackChannels.push(slackChannel);
  return slackChannel;
}

function findReusableConversation(store, customerId, orderId) {
  return store.conversations
    .filter(
      (conversation) =>
        conversation.customerId === customerId &&
        conversation.orderId === orderId &&
        conversation.status !== "closed"
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function ensureConversation(store, customer, slackChannel, payload) {
  const orderId = payload.orderId.trim();
  const existing = findReusableConversation(store, customer.id, orderId);

  if (existing) {
    existing.latestMessageAt = nowIso();
    existing.source = payload.source;
    return {
      conversation: existing,
      reusedConversation: true,
      reusedThread: true
    };
  }

  const conversationId = nextId(store, "conversation");
  const slackThreadId = nextId(store, "slackThread");
  const createdAt = nowIso();

  const conversation = {
    id: conversationId,
    customerId: customer.id,
    orderId,
    source: payload.source,
    subject: String(payload.subject || "").trim() || `Support request for ${orderId}`,
    issueType: String(payload.issueType || "order_status"),
    priority: String(payload.priority || "medium"),
    status: "new",
    assignedTo: "",
    summary: String(payload.query || "").trim().slice(0, 140),
    slackChannelId: slackChannel.id,
    slackThreadId,
    latestMessageAt: createdAt,
    createdAt,
    resolvedAt: null,
    closedAt: null
  };

  const slackThread = {
    id: slackThreadId,
    slackChannelId: slackChannel.id,
    externalThreadRef: `${Math.floor(Date.now() / 1000)}.${String(conversationId).padStart(6, "0")}`,
    orderId,
    conversationId,
    threadStatus: "open",
    reactions: [],
    createdAt,
    closedAt: null
  };

  store.conversations.push(conversation);
  store.slackThreads.push(slackThread);
  addStatusEvent(store, conversationId, "none", "new", "system", "intake");

  return {
    conversation,
    reusedConversation: false,
    reusedThread: false
  };
}

function buildState(store) {
  const customers = store.customers
    .map((customer) => {
      const slackChannel = store.slackChannels.find(
        (channel) => channel.id === customer.slackChannelId
      );
      const customerConversations = store.conversations
        .filter((conversation) => conversation.customerId === customer.id)
        .sort((left, right) => right.latestMessageAt.localeCompare(left.latestMessageAt));

      return {
        ...customer,
        slackChannelName: slackChannel ? `#${slackChannel.name}` : "Not assigned",
        conversationCount: customerConversations.length
      };
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const conversations = store.conversations
    .map((conversation) => {
      const customer = store.customers.find((item) => item.id === conversation.customerId);
      const slackChannel = store.slackChannels.find(
        (channel) => channel.id === conversation.slackChannelId
      );
      const slackThread = findSlackThread(store, conversation.slackThreadId);
      const messages = store.messages
        .filter((message) => message.conversationId === conversation.id)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const deliveries = store.deliveries
        .filter((delivery) => delivery.conversationId === conversation.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const statusEvents = store.statusEvents
        .filter((event) => event.conversationId === conversation.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

      return {
        ...conversation,
        customerName: customer ? customer.name : "Unknown customer",
        slackChannelName: slackChannel ? `#${slackChannel.name}` : "Unassigned",
        slackThreadRef: slackThread ? slackThread.externalThreadRef : "Pending",
        slackReactions: slackThread ? slackThread.reactions : [],
        threadStatus: slackThread ? slackThread.threadStatus : "open",
        messages,
        deliveries,
        statusEvents
      };
    })
    .sort((left, right) => right.latestMessageAt.localeCompare(left.latestMessageAt));

  const countByStatus = ALLOWED_STATUSES.reduce((accumulator, status) => {
    accumulator[status] = store.conversations.filter(
      (conversation) => conversation.status === status
    ).length;
    return accumulator;
  }, {});

  const metrics = {
    customers: store.customers.length,
    conversations: store.conversations.length,
    slackChannels: store.slackChannels.length,
    messages: store.messages.length,
    countByStatus
  };

  return {
    metrics,
    customers,
    conversations
  };
}

async function handleIntake(request, response) {
  try {
    const payload = await collectRequestBody(request);
    const required = ["customerName", "orderId", "source", "query"];
    const missing = required.filter((field) => !String(payload[field] || "").trim());

    if (missing.length) {
      json(response, 400, {
        error: `Missing required fields: ${missing.join(", ")}`
      });
      return;
    }

    const store = readStore();
    const customer = ensureCustomer(store, payload);
    const slackChannel = ensureSlackChannel(store, customer);
    const routing = ensureConversation(store, customer, slackChannel, payload);
    const conversation = routing.conversation;

    addMessage(
      store,
      conversation.id,
      "customer",
      "inbound",
      payload.query,
      payload.source,
      payload.sourceLink
    );

    if (routing.reusedConversation) {
      applyStatusChange(store, conversation, "new", "system", "customer_follow_up");
    }

    addMessage(
      store,
      conversation.id,
      "system",
      "internal",
      routing.reusedThread
        ? `Existing Slack thread reused for ${conversation.orderId}.`
        : `New Slack thread created for ${conversation.orderId} in #${slackChannel.name}.`,
      "slack",
      ""
    );

    conversation.latestMessageAt = nowIso();
    conversation.summary = String(payload.query || "").trim().slice(0, 140);
    syncSlackThreadState(store, conversation);
    writeStore(store);

    json(response, 201, {
      message: "Customer request routed successfully.",
      routing: {
        customerId: customer.id,
        conversationId: conversation.id,
        slackChannel: `#${slackChannel.name}`,
        slackThreadRef: findSlackThread(store, conversation.slackThreadId).externalThreadRef,
        reusedConversation: routing.reusedConversation,
        reusedThread: routing.reusedThread
      },
      state: buildState(store)
    });
  } catch (error) {
    json(response, 400, { error: error.message });
  }
}

async function handleReply(request, response, conversationId) {
  try {
    const payload = await collectRequestBody(request);
    const messageBody = String(payload.message || "").trim();

    if (!messageBody) {
      json(response, 400, { error: "Reply message is required." });
      return;
    }

    const store = readStore();
    const conversation = findConversation(store, conversationId);

    if (!conversation) {
      json(response, 404, { error: "Conversation not found." });
      return;
    }

    if (conversation.status === "closed") {
      json(response, 409, {
        error: "Closed tickets cannot receive new replies. A fresh customer message will create a new Slack thread."
      });
      return;
    }

    addMessage(store, conversationId, "agent", "internal", messageBody, "slack", "");

    if (payload.sendToCustomer) {
      addMessage(store, conversationId, "agent", "outbound", messageBody, conversation.source, "");
      addDelivery(
        store,
        conversationId,
        conversation.source,
        "sent",
        `Reply sent back to customer on ${conversation.source.toUpperCase()}`
      );
      applyStatusChange(
        store,
        conversation,
        "waiting_on_customer",
        String(payload.actorName || "Support Agent"),
        "web_app_reply"
      );
    } else {
      applyStatusChange(
        store,
        conversation,
        "assigned",
        String(payload.actorName || "Support Agent"),
        "internal_reply"
      );
    }

    conversation.latestMessageAt = nowIso();
    writeStore(store);

    json(response, 200, {
      message: "Reply logged successfully.",
      state: buildState(store)
    });
  } catch (error) {
    json(response, 400, { error: error.message });
  }
}

async function handleStatusUpdate(request, response, conversationId) {
  try {
    const payload = await collectRequestBody(request);
    const newStatus = String(payload.status || "").trim();

    if (!ALLOWED_STATUSES.includes(newStatus)) {
      json(response, 400, { error: "Valid status is required." });
      return;
    }

    const store = readStore();
    const conversation = findConversation(store, conversationId);

    if (!conversation) {
      json(response, 404, { error: "Conversation not found." });
      return;
    }

    applyStatusChange(
      store,
      conversation,
      newStatus,
      String(payload.actorName || "Support Lead"),
      "web_app_status"
    );
    conversation.latestMessageAt = nowIso();
    writeStore(store);

    json(response, 200, {
      message: `Ticket moved to ${newStatus}.`,
      state: buildState(store)
    });
  } catch (error) {
    json(response, 400, { error: error.message });
  }
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/state") {
    json(response, 200, buildState(readStore()));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/intake") {
    await handleIntake(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/reset") {
    const store = resetStore();
    json(response, 200, {
      message: "Demo data reset.",
      state: buildState(store)
    });
    return;
  }

  const replyMatch =
    request.method === "POST" ? url.pathname.match(/^\/api\/conversations\/(\d+)\/reply$/) : null;
  if (replyMatch) {
    await handleReply(request, response, Number(replyMatch[1]));
    return;
  }

  const statusMatch =
    request.method === "POST"
      ? url.pathname.match(/^\/api\/conversations\/(\d+)\/status$/)
      : null;
  if (statusMatch) {
    await handleStatusUpdate(request, response, Number(statusMatch[1]));
    return;
  }

  json(response, 404, { error: "API route not found." });
}

function handleStatic(request, response, url) {
  let filePath = path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);
  filePath = path.normalize(filePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  sendFile(response, filePath);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, url);
    return;
  }

  handleStatic(request, response, url);
});

ensureStoreExists();
server.listen(PORT, () => {
  console.log(`CS Simplified server running at http://localhost:${PORT}`);
  console.log(`Mutable demo data path: ${STORE_PATH}`);
});
