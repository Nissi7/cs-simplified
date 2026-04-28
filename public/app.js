const DEMO_SCENARIOS = [
  {
    key: "new-ticket",
    title: "New customer from X",
    description: "Create a fresh customer, fresh Slack channel, and fresh issue thread.",
    payload: {
      customerName: "Rohan Mehta",
      orderId: "ORD-10911",
      source: "x",
      issueType: "order_status",
      priority: "high",
      handle: "@rohanshops",
      email: "rohan.mehta@example.com",
      sourceLink: "https://x.com/acme_support/status/10911",
      query: "I just sent a DM on X. Can you tell me if ORD-10911 ships today?"
    }
  },
  {
    key: "reuse-thread",
    title: "Existing order follow-up",
    description: "Reuse Maya's open Slack thread for the same order.",
    payload: {
      customerName: "Maya Patel",
      orderId: "ORD-10024",
      source: "x",
      issueType: "order_status",
      priority: "high",
      handle: "@mayaorders",
      email: "maya.patel@example.com",
      sourceLink: "https://x.com/acme_support/status/10024-followup",
      query: "Checking again on ORD-10024. I still have not seen the package move."
    }
  },
  {
    key: "closed-thread",
    title: "Closed ticket gets a new thread",
    description: "Nina follows up after close, so the app opens a new Slack thread.",
    payload: {
      customerName: "Nina Gomez",
      orderId: "ORD-10333",
      source: "x",
      issueType: "refund",
      priority: "medium",
      handle: "@ninagstyle",
      email: "nina.gomez@example.com",
      sourceLink: "https://x.com/acme_support/status/10333-followup",
      query: "The refund still has not shown up. Can someone recheck ORD-10333?"
    }
  }
];

const STATUS_ORDER = ["all", "new", "assigned", "waiting_on_customer", "resolved", "closed"];

const state = {
  data: null,
  selectedConversationId: null,
  filterStatus: "all",
  activeView: "showcase"
};

const metricsEl = document.getElementById("metrics");
const conversationListEl = document.getElementById("conversation-list");
const conversationDetailEl = document.getElementById("conversation-detail");
const customerListEl = document.getElementById("customer-list");
const ticketFiltersEl = document.getElementById("ticket-filters");
const intakeForm = document.getElementById("intake-form");
const routingResultEl = document.getElementById("routing-result");
const demoScenariosEl = document.getElementById("demo-scenarios");
const resetDemoButton = document.getElementById("reset-demo");
const showcaseViewEl = document.getElementById("showcase-view");
const operationsViewEl = document.getElementById("operations-view");

function formatSource(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDate(value) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatReaction(reaction) {
  return `:${reaction}:`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showResult(message, tone = "success") {
  routingResultEl.classList.remove("hidden", "error");
  routingResultEl.innerHTML = message;
  if (tone === "error") {
    routingResultEl.classList.add("error");
  }
}

function setActiveView(view) {
  state.activeView = view;
  showcaseViewEl.classList.toggle("hidden", view !== "showcase");
  operationsViewEl.classList.toggle("hidden", view !== "operations");

  document.querySelectorAll("[data-view-tab]").forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-view-tab") === view);
  });
}

function filteredConversations() {
  if (state.filterStatus === "all") {
    return state.data.conversations;
  }

  return state.data.conversations.filter(
    (conversation) => conversation.status === state.filterStatus
  );
}

async function fetchState() {
  const response = await fetch("/api/state");
  if (!response.ok) {
    throw new Error("Unable to load state.");
  }

  state.data = await response.json();

  const visibleConversations = filteredConversations();
  if (
    !state.selectedConversationId ||
    !state.data.conversations.find((conversation) => conversation.id === state.selectedConversationId)
  ) {
    state.selectedConversationId = visibleConversations[0]?.id || state.data.conversations[0]?.id || null;
  }

  render();
}

function renderMetrics() {
  const counts = state.data.metrics.countByStatus;
  const items = [
    ["Customers", state.data.metrics.customers],
    ["Tickets", state.data.metrics.conversations],
    ["New", counts.new],
    ["Assigned", counts.assigned],
    ["Waiting", counts.waiting_on_customer],
    ["Closed", counts.closed]
  ];

  metricsEl.innerHTML = items
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");
}

function renderFilters() {
  const counts = state.data.metrics.countByStatus;
  ticketFiltersEl.innerHTML = STATUS_ORDER.map((status) => {
    const count = status === "all" ? state.data.metrics.conversations : counts[status];
    const active = status === state.filterStatus;

    return `
      <button
        class="filter-chip ${active ? "active" : ""}"
        type="button"
        data-filter-status="${escapeHtml(status)}"
      >
        ${escapeHtml(formatSource(status))} (${escapeHtml(count)})
      </button>
    `;
  }).join("");
}

function renderDemoScenarios() {
  demoScenariosEl.innerHTML = DEMO_SCENARIOS.map(
    (scenario) => `
      <article class="demo-card">
        <div>
          <h3>${escapeHtml(scenario.title)}</h3>
          <p>${escapeHtml(scenario.description)}</p>
        </div>
        <button type="button" class="secondary-button" data-demo-key="${escapeHtml(scenario.key)}">Run</button>
      </article>
    `
  ).join("");
}

function renderConversations() {
  const conversations = filteredConversations();

  if (!conversations.length) {
    conversationListEl.innerHTML = `<div class="list-empty">No tickets in this status yet.</div>`;
    return;
  }

  if (!conversations.find((conversation) => conversation.id === state.selectedConversationId)) {
    state.selectedConversationId = conversations[0].id;
  }

  conversationListEl.innerHTML = conversations
    .map((conversation) => {
      const isActive = conversation.id === state.selectedConversationId;
      const reactionRow = conversation.slackReactions.length
        ? conversation.slackReactions
            .map((reaction) => `<span class="reaction-chip">${escapeHtml(formatReaction(reaction))}</span>`)
            .join("")
        : `<span class="reaction-chip muted">No Slack reaction</span>`;

      return `
        <article class="conversation-card ${isActive ? "active" : ""}" data-conversation-id="${conversation.id}">
          <div class="conversation-head">
            <div>
              <h3>${escapeHtml(conversation.customerName)}</h3>
              <p class="meta">${escapeHtml(conversation.subject)} | ${escapeHtml(conversation.orderId)}</p>
            </div>
            <span class="status-pill ${escapeHtml(conversation.status)}">${escapeHtml(formatSource(conversation.status))}</span>
          </div>
          <p class="summary">${escapeHtml(conversation.summary)}</p>
          <div class="conversation-meta">
            <span>${escapeHtml(formatSource(conversation.source))}</span>
            <span>${escapeHtml(formatSource(conversation.priority))} priority</span>
            <span>${escapeHtml(conversation.slackChannelName)}</span>
          </div>
          <div class="reaction-row">${reactionRow}</div>
        </article>
      `;
    })
    .join("");
}

function renderConversationDetail() {
  const conversation = state.data.conversations.find(
    (item) => item.id === state.selectedConversationId
  );

  if (!conversation) {
    conversationDetailEl.className = "empty-state";
    conversationDetailEl.textContent = "No ticket selected.";
    return;
  }

  const reactions = conversation.slackReactions.length
    ? conversation.slackReactions
        .map((reaction) => `<span class="reaction-chip">${escapeHtml(formatReaction(reaction))}</span>`)
        .join("")
    : `<span class="reaction-chip muted">No Slack reaction</span>`;

  const messages = conversation.messages
    .map(
      (message) => `
        <article class="message-card ${escapeHtml(message.authorType)}">
          <div class="message-meta">
            ${escapeHtml(formatSource(message.authorType))} | ${escapeHtml(formatSource(message.direction))} | ${escapeHtml(formatSource(message.source))} | ${escapeHtml(formatDate(message.createdAt))}
          </div>
          <div>${escapeHtml(message.body)}</div>
        </article>
      `
    )
    .join("");

  const deliveries = conversation.deliveries.length
    ? conversation.deliveries
        .map(
          (delivery) => `
            <article class="delivery-card">
              <div class="detail-meta">
                ${escapeHtml(formatSource(delivery.targetSource))} | ${escapeHtml(formatSource(delivery.status))} | ${escapeHtml(formatDate(delivery.createdAt))}
              </div>
              <div>${escapeHtml(delivery.payloadSummary)}</div>
            </article>
          `
        )
        .join("")
    : `<div class="delivery-card">No outbound delivery activity yet.</div>`;

  const timeline = conversation.statusEvents.length
    ? conversation.statusEvents
        .map(
          (event) => `
            <article class="status-event">
              <strong>${escapeHtml(formatSource(event.newStatus))}</strong>
              <p>${escapeHtml(event.changedBy)} via ${escapeHtml(formatSource(event.changeSource))}</p>
              <span>${escapeHtml(formatDate(event.createdAt))}</span>
            </article>
          `
        )
        .join("")
    : `<div class="status-event">No status history yet.</div>`;

  const statusButtons = STATUS_ORDER.filter((status) => status !== "all")
    .map((status) => {
      const active = status === conversation.status;
      const locked = conversation.status === "closed" && status !== "closed";

      return `
        <button
          type="button"
          class="status-button ${active ? "active" : ""}"
          data-status-button="${escapeHtml(status)}"
          ${locked ? "disabled" : ""}
        >
          ${escapeHtml(formatSource(status))}
        </button>
      `;
    })
    .join("");

  const replyArea = conversation.status === "closed"
    ? `
      <div class="closed-note">
        This ticket is closed. A new customer follow-up for the same order will create a fresh Slack thread in this customer channel.
      </div>
    `
    : `
      <form id="reply-form" class="reply-form">
        <label class="full-width">
          Agent response
          <textarea name="message" rows="4" placeholder="Share an update or next step." required></textarea>
        </label>
        <label>
          Acting as
          <input name="actorName" value="Demo Agent" />
        </label>
        <label class="checkbox-row">
          <input type="checkbox" name="sendToCustomer" checked />
          Send back to the original customer channel
        </label>
        <button type="submit" class="primary-button">Post reply</button>
      </form>
    `;

  conversationDetailEl.className = "detail-content";
  conversationDetailEl.innerHTML = `
    <div class="detail-grid">
      <div class="mapping-grid">
        <div>
          <strong>Customer</strong>
          <span>${escapeHtml(conversation.customerName)}</span>
        </div>
        <div>
          <strong>Order</strong>
          <span>${escapeHtml(conversation.orderId)}</span>
        </div>
        <div>
          <strong>Inbound source</strong>
          <span>${escapeHtml(formatSource(conversation.source))}</span>
        </div>
        <div>
          <strong>Slack channel</strong>
          <span>${escapeHtml(conversation.slackChannelName)}</span>
        </div>
        <div>
          <strong>Slack thread</strong>
          <span>${escapeHtml(conversation.slackThreadRef)}</span>
        </div>
        <div>
          <strong>Assigned to</strong>
          <span>${escapeHtml(conversation.assignedTo || "Unassigned")}</span>
        </div>
        <div>
          <strong>Priority</strong>
          <span>${escapeHtml(formatSource(conversation.priority))}</span>
        </div>
        <div>
          <strong>Slack reactions</strong>
          <div class="reaction-row">${reactions}</div>
        </div>
      </div>

      <section class="detail-block">
        <div class="detail-block-head">
          <h3>Status controls</h3>
          <p>These actions mirror status changes into the Slack thread.</p>
        </div>
        <div class="status-toolbar">${statusButtons}</div>
      </section>

      <section class="detail-block">
        <div class="detail-block-head">
          <h3>Status history</h3>
          <p>Every change is logged as part of the support record.</p>
        </div>
        <div class="status-timeline">${timeline}</div>
      </section>

      <section class="detail-block">
        <div class="detail-block-head">
          <h3>Message timeline</h3>
          <p>Inbound, internal, and outbound communication all stay attached to the ticket.</p>
        </div>
        <div class="message-stack">${messages}</div>
      </section>

      <section class="detail-block">
        <div class="detail-block-head">
          <h3>Outbound delivery</h3>
          <p>Customer-facing replies can be sent back through the original source channel.</p>
        </div>
        <div class="delivery-stack">${deliveries}</div>
      </section>

      <section class="detail-block">
        <div class="detail-block-head">
          <h3>Reply from the app</h3>
          <p>Agents still live in Slack, but the admin app can push ticket replies and status updates too.</p>
        </div>
        ${replyArea}
      </section>
    </div>
  `;
}

function renderCustomers() {
  customerListEl.innerHTML = `
    <div class="customer-grid">
      ${state.data.customers
        .map((customer) => {
          const handles = customer.handles.length
            ? customer.handles
                .map((item) => `${formatSource(item.source)}: ${item.value}`)
                .join(" | ")
            : "No handles captured yet";

          return `
            <article class="customer-card">
              <div class="customer-head">
                <h3>${escapeHtml(customer.name)}</h3>
                <span class="tier-pill">${escapeHtml(formatSource(customer.tier || "standard"))}</span>
              </div>
              <div class="customer-meta">${escapeHtml(customer.slackChannelName)}</div>
              <p>${escapeHtml(handles)}</p>
              <p>${escapeHtml(customer.email)} | ${escapeHtml(customer.phone)}</p>
              <div class="reaction-row">
                <span class="reaction-chip muted">${escapeHtml(customer.conversationCount)} tickets</span>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function render() {
  setActiveView(state.activeView);
  renderMetrics();
  renderFilters();
  renderDemoScenarios();
  renderConversations();
  renderConversationDetail();
  renderCustomers();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Request failed.");
  }

  return result;
}

async function runIntake(payload) {
  const result = await postJson("/api/intake", payload);
  state.data = result.state;
  state.selectedConversationId = result.routing.conversationId;
  state.filterStatus = "all";
  state.activeView = "operations";
  render();

  const threadMessage = result.routing.reusedThread
    ? "Existing Slack thread reused."
    : "Fresh Slack thread created.";

  showResult(
    `<strong>${escapeHtml(result.message)}</strong><br />Routed into ${escapeHtml(result.routing.slackChannel)} and thread ${escapeHtml(result.routing.slackThreadRef)}. ${escapeHtml(threadMessage)}`
  );
}

async function resetDemo() {
  const result = await postJson("/api/reset", {});
  state.data = result.state;
  state.filterStatus = "all";
  state.activeView = "showcase";
  state.selectedConversationId = state.data.conversations[0]?.id || null;
  render();
  showResult("<strong>Demo reset.</strong><br />Seed data restored for the next walkthrough.");
}

document.addEventListener("click", async (event) => {
  const viewTab = event.target.closest("[data-view-tab]");
  if (viewTab) {
    setActiveView(viewTab.getAttribute("data-view-tab"));
    return;
  }

  const conversationCard = event.target.closest("[data-conversation-id]");
  if (conversationCard) {
    state.selectedConversationId = Number(conversationCard.getAttribute("data-conversation-id"));
    renderConversations();
    renderConversationDetail();
    return;
  }

  const filterButton = event.target.closest("[data-filter-status]");
  if (filterButton) {
    state.filterStatus = filterButton.getAttribute("data-filter-status");
    renderFilters();
    renderConversations();
    renderConversationDetail();
    return;
  }

  const scenarioButton = event.target.closest("[data-demo-key]");
  if (scenarioButton) {
    const scenario = DEMO_SCENARIOS.find(
      (item) => item.key === scenarioButton.getAttribute("data-demo-key")
    );
    if (!scenario) {
      return;
    }

    scenarioButton.disabled = true;
    try {
      await runIntake(scenario.payload);
    } catch (error) {
      showResult(escapeHtml(error.message), "error");
    } finally {
      scenarioButton.disabled = false;
    }
    return;
  }

  const statusButton = event.target.closest("[data-status-button]");
  if (statusButton) {
    const conversation = state.data.conversations.find(
      (item) => item.id === state.selectedConversationId
    );
    if (!conversation) {
      return;
    }

    statusButton.disabled = true;
    try {
      const result = await postJson(
        `/api/conversations/${conversation.id}/status`,
        {
          status: statusButton.getAttribute("data-status-button"),
          actorName: "Demo Lead"
        }
      );
      state.data = result.state;
      render();
      showResult("<strong>Ticket updated.</strong><br />Slack thread status indicators updated.");
    } catch (error) {
      showResult(escapeHtml(error.message), "error");
    } finally {
      statusButton.disabled = false;
    }
  }
});

intakeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(intakeForm);
  const payload = Object.fromEntries(formData.entries());
  const button = intakeForm.querySelector("button");
  button.disabled = true;

  try {
    await runIntake(payload);
    intakeForm.reset();
  } catch (error) {
    showResult(escapeHtml(error.message), "error");
  } finally {
    button.disabled = false;
  }
});

conversationDetailEl.addEventListener("submit", async (event) => {
  if (event.target.id !== "reply-form") {
    return;
  }

  event.preventDefault();
  const conversation = state.data.conversations.find(
    (item) => item.id === state.selectedConversationId
  );
  if (!conversation) {
    return;
  }

  const formData = new FormData(event.target);
  const payload = {
    message: formData.get("message"),
    actorName: formData.get("actorName"),
    sendToCustomer: formData.get("sendToCustomer") === "on"
  };
  const button = event.target.querySelector("button");
  button.disabled = true;

  try {
    const result = await postJson(`/api/conversations/${conversation.id}/reply`, payload);
    state.data = result.state;
    render();
    showResult("<strong>Reply posted.</strong><br />The ticket timeline and outbound delivery log were both updated.");
  } catch (error) {
    showResult(escapeHtml(error.message), "error");
  } finally {
    button.disabled = false;
  }
});

resetDemoButton.addEventListener("click", async () => {
  resetDemoButton.disabled = true;
  try {
    await resetDemo();
  } catch (error) {
    showResult(escapeHtml(error.message), "error");
  } finally {
    resetDemoButton.disabled = false;
  }
});

fetchState().catch((error) => {
  conversationDetailEl.className = "empty-state";
  conversationDetailEl.textContent = error.message;
});
