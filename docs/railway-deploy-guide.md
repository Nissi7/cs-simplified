# Railway Deploy Guide

## Goal

Deploy CS Simplified to Railway with persistent demo data so judges and testers can use a public URL.

## Recommended setup

- Railway project connected to GitHub
- Docker-based deploy using the included `Dockerfile`
- Railway volume attached to the app service
- `DATA_DIR=/app/data`

## Why this mount path matters

The application stores mutable state in `store.json`. Railway volumes persist whatever is written under the attached mount path.

This app expects:

- immutable seed file in the repo:
  - `seed-data/seed.json`
- mutable live store in the runtime data directory:
  - `${DATA_DIR}/store.json`

For Railway, use:

- volume mount path:
  - `/app/data`
- environment variable:
  - `DATA_DIR=/app/data`

## Step-by-step deployment

1. Push the project to GitHub
2. Log in to Railway
3. Create a new project from your GitHub repository
4. Confirm Railway picks up the `Dockerfile`
5. Open the deployed service settings
6. Add this environment variable:
   - `DATA_DIR=/app/data`
7. Create a Railway volume and attach it to the service
8. Set the volume mount path to:
   - `/app/data`
9. Redeploy if Railway does not automatically restart the service
10. Open the public app URL

## What to verify after deploy

- The homepage loads
- The demo scenario buttons work
- `Reset demo` works
- Creating a new ticket survives a service restart

## Suggested pre-presentation routine

1. Open the hosted app
2. Click `Reset demo`
3. Run one demo scenario to confirm the app is healthy
4. Keep the app open in a browser tab before your judging slot

## Optional improvement after deployment

If you later want a more production-like version:

- replace file storage with Postgres
- keep seed/reset logic for the demo experience
- add real Slack and Twilio integrations
