# Judge Demo Script

## Goal

Show that CS Simplified lets customers stay in their own channel while support teams stay inside Slack, without losing ticket state or customer context.

## 60 second version

1. Open the app and say:
   "This is a Slack-first support operating layer for ecommerce brands."
2. Point to the left-side demo presets and say:
   "I can simulate inbound requests from social or SMS in one click."
3. Run `New customer from X`.
4. Open the new ticket and show:
   - customer identity
   - Slack channel
   - Slack thread
   - status controls
5. Move the ticket to `assigned` and point out the `:eyes:` reaction.
6. Send a reply and explain that the outbound response is logged against the original customer channel.
7. Run `Closed ticket gets a new thread`.
8. Explain:
   "The customer channel is reused, but because the old issue was closed, the app opens a new Slack thread instead of polluting the old one."

## What to say when judges ask why it matters

- Customers do not need to switch to email or wait on hold.
- Small brands do not need to buy a bloated enterprise suite.
- Support agents do not need to watch multiple disconnected tools.
- The business gets one support record across channels and one Slack-native operating workflow.

## What to emphasize technically

- Unified customer identity
- Slack channel per customer
- Slack thread per issue
- Ticket lifecycle with visible Slack status signaling
- Clean handling of closed issues
- Clear path from prototype to real integrations

## Strong closer

"The MVP proves the operating model. The next step is swapping the simulated connectors for real Slack, Twilio, and commerce integrations while keeping the same routing core."
