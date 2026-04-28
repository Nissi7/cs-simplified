# CS Simplified

CS Simplified is a Slack-first omnichannel support demo for small and medium ecommerce brands. Customers can reach the business from channels like SMS or X, while support teams continue working in Slack. The application becomes the system of record for customer identity, ticket state, Slack channel mapping, thread mapping, message history, and delivery activity.

## Why this demo works for a competition

- It shows a clear problem: customers should not have to leave the channel they already use.
- It shows a clear workflow: intake, route to Slack, collaborate, reply, and close.
- It shows a clear product point of view: one Slack channel per customer and one thread per issue.
- It gives judges something hands-on to click through instead of only slides.

## Demo highlights

- Simulated inbound requests from SMS, X, Slack, Instagram, Facebook, and phone-style workflows
- Customer identity matching and capture
- Automatic Slack channel creation for new customers
- Slack thread reuse for active tickets on the same order
- New Slack thread creation when a previously closed issue gets a follow-up
- Ticket status controls with Slack-style reaction signaling
- Reply workflow that logs both internal and customer-facing communication
- Resettable demo state so each walkthrough can start clean

## Competition walkthrough

The best quick demo is:

1. Run `New customer from X`
2. Open the new ticket and move it to `assigned`
3. Send a reply back to the customer channel
4. Run `Closed ticket gets a new thread`
5. Show that the customer channel is reused but the old closed thread is not

A fuller script lives in [judge-demo-script.md](</C:/Users/josh2/OneDrive/Documents/New project/docs/judge-demo-script.md>).

## Project structure

- `server.js`
  HTTP server, JSON API, routing logic, demo reset, and file-backed store handling
- `public/index.html`
  Main judge-facing dashboard and operations UI
- `public/app.js`
  Frontend rendering, demo presets, ticket actions, and API calls
- `public/styles.css`
  Visual presentation for the competition demo
- `data/seed.json`
  Pristine reset state for the demo
- `data/store.json`
  Working mutable state during local or hosted runs
- `docs/cs-simplified-mvp-spec.md`
  Product definition and architecture

## Run locally

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Railway deployment

This project is now prepared for Railway and supports persistent demo data through an attached volume.

### Why Railway is the best fit here

- The app is a single Node server
- The app keeps mutable demo state in `store.json`
- Railway volumes can persist a mounted app directory
- Railway is a smoother fit for this architecture than Vercel

### How persistence works

- `data/seed.json` stays in the repo and acts as the pristine reset state
- `store.json` becomes the live mutable file
- If `DATA_DIR` is set, the app writes `store.json` there
- On Railway, mount your volume to `/app/data` and set:
  - `DATA_DIR=/app/data`

### Railway setup steps

1. Push this repo to GitHub
2. Create a new Railway project from the GitHub repo
3. Railway should detect the included `Dockerfile`
4. Add an environment variable:
   - `DATA_DIR=/app/data`
5. Attach a Railway volume to the service
6. Set the volume mount path to:
   - `/app/data`
7. Deploy the service
8. Open the public Railway URL

### Recommended Railway settings

- Start command:
  - handled by the included `Dockerfile`
- Volume mount path:
  - `/app/data`
- Environment variable:
  - `DATA_DIR=/app/data`

### Competition-safe deployment advice

- Before your presentation, press `Reset demo`
- If judges will try it themselves, leave the volume attached so the app state persists normally
- If you want a clean environment for each demo, press `Reset demo` immediately before presenting

### Fast fallback option

If you do not want to configure a volume right away, Railway can still run the app without `DATA_DIR`. In that case the app will use its local bundled `data` folder, but any runtime changes may be lost on redeploy or restart.

## Docker support

A simple production-style container file is included in [Dockerfile](</C:/Users/josh2/OneDrive/Documents/New project/Dockerfile>) so you can deploy on platforms that prefer container-based delivery.

## Railway files

- [railway.json](</C:/Users/josh2/OneDrive/Documents/New project/railway.json>)
  Railway deployment configuration
- [.env.example](</C:/Users/josh2/OneDrive/Documents/New project/.env.example>)
  Example runtime variables for local and hosted environments

## Next product steps

- Replace the mock Slack behavior with the real Slack API
- Add Twilio for SMS
- Add a real X connector
- Move the demo datastore to PostgreSQL
- Add authentication and support roles
- Add Shopify or OMS order lookups
- Add internal notes, assignment controls, and search
