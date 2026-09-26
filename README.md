# minntelligence-support

Serverless open-source support inbox and chat widget. Cloudflare-native Chatwoot replacement for small teams: Worker + D1 + R2 + Email Service, no servers. Live at [support.minntelligence.fyi](https://support.minntelligence.fyi).

## What it does

- Embeddable chat bubble (`public/widget.js`) — one script tag, polls for replies, keeps identity in localStorage.
- Locked agent inbox (`/`) — passcode gate, open/closed filters, reply/close/reopen, 8s polling.
- Email in both directions — inbound via Email Routing `email()` handler (matched to open conversations by sender, else new thread), outbound agent replies via Email Service. Dual delivery: inbox keeps a copy, Gmail gets a copy (one action per Routing rule, so the worker forwards).
- Attachments: R2 binding ready (`FILES`); widget upload UI not built yet.

## Setup

```sh
npx wrangler d1 create support-inbox-db        # paste database_id into wrangler.jsonc
npx wrangler r2 bucket create support-inbox-files
npx wrangler d1 migrations apply support-inbox-db --remote
npx wrangler secret put LOCK_KEY              # admin passcode
npx wrangler secret put FORWARD_TO            # Gmail copy address (optional; skip to disable)
npx wrangler deploy
```

Email (optional): enable Email Routing on your zone, onboard the domain for Email Sending, add a rule `support@yourdomain → this worker`, and a forward rule for anything else you still want in Gmail.

## Embed

```html
<script src="https://support.minntelligence.fyi/widget.js"></script>
```

Scope it to help/contact pages; keep marketing pages clean.

## License

MIT.
