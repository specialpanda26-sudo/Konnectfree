# Konnect Free

Node/Express + MongoDB app for the Konnect Free hotspot portal: M-Pesa
payments via IntaSend, voucher codes, device/session tracking, a
router-integration point, and a JWT-protected admin API — plus the
customer-facing portal itself.

One deployable, one URL: `public/index.html` (the captive-portal page)
is served by this same Express app as a static asset, with a per-request
CSP nonce stamped onto its inline `<script>`/`<style>` tags. No separate
frontend host or `API_BASE` URL to configure — the page calls `/api/...`
on its own origin.

## Stack
Express 4 · Mongoose 8 · IntaSend (M-Pesa STK push) · JWT + bcrypt

## Getting started

```bash
npm install
cp .env.example .env      # then fill in real values — see below
npm run create-admin      # creates your first admin login (interactive, no default password)
node scripts/seedPackages.js   # loads the 5 packages from the frontend
npm run dev                # nodemon, or `npm start` for production
```

Health check: `GET /health`

## Required environment variables

See `.env.example` for the full list with comments. You must set:

| Variable | Why |
|---|---|
| `MONGO_URI` | database connection |
| `JWT_SECRET` | signs admin session tokens — generate with `openssl rand -hex 64` |
| `INTASEND_SECRET_KEY` / `INTASEND_PUBLISHABLE_KEY` | from your IntaSend dashboard |
| `INTASEND_WEBHOOK_CHALLENGE` | shared secret to verify webhooks really come from IntaSend — set the same value in the IntaSend dashboard |
| `ALLOWED_ORIGINS` | comma-separated list of domains allowed to call this API from a browser |

The server refuses to start if any required variable is missing — see `src/config/env.js`.

## One thing you must finish before accepting real payments

- **`src/services/intasend.service.js`** — confirm the exact response
  shape of IntaSend's STK-push endpoint and the exact webhook
  signature header/field in your IntaSend dashboard sandbox before
  going live; both are marked with comments showing what to check.
- **`src/services/router.service.js`** now really talks to MikroTik
  (RouterOS API via `node-routeros`) — but it assumes a plain
  MikroTik hotspot using `/ip/hotspot/ip-binding`. If you're on
  MikroTik+RADIUS or CoovaChilli instead, this needs a different
  implementation; the file's comments explain the alternatives. Set
  `MIKROTIK_HOST` / `MIKROTIK_USER` / `MIKROTIK_PASSWORD` in `.env` to
  go live — until then it runs in simulated mode (logs what it would
  have done, returns success) so the rest of the app is testable.
## Security features

- **Secrets**: all in `.env`, gitignored; server fails to start if any required secret is missing or `JWT_SECRET` is too short.
- **Passwords**: bcrypt (cost 12), never stored or logged in plaintext.
- **Admin auth**: JWT (short expiry, `JWT_EXPIRES_IN`), account lockout after 5 failed logins (15 min), generic "invalid username or password" error (no username enumeration), login endpoint rate-limited.
- **Webhook trust**: `/api/webhooks/intasend` verifies a shared challenge value before trusting any payload — a payment can only ever be marked "paid" by a verified IntaSend webhook, never by anything the browser claims. Webhook processing is idempotent (checked via `payment.processedAt`) so a retried webhook can't double-bind a device.
- **Pricing integrity**: the browser sends a `packageId`, never a price — the price is always looked up server-side.
- **Input validation**: `express-validator` on every write route; MAC and phone formats are checked server-side, not just in the UI.
- **Injection protection**: `express-mongo-sanitize` strips `$`/`.` operators from input (blocks NoSQL injection), `hpp` blocks HTTP parameter pollution.
- **Transport**: `helmet` (HSTS, sane default headers), strict CORS allowlist (`ALLOWED_ORIGINS`), small JSON body limit (100kb).
- **Rate limiting**: global limiter, plus tighter limits on `/api/stk-push` (5/10min per IP — this triggers a real M-Pesa prompt on someone's phone, so it's the most abuse-sensitive route) and `/api/auth/login`.
- **Error handling**: stack traces and internal error details are never sent to the client in production — only a generic message; full detail goes to the server log.
- **Voucher codes**: generated with `crypto.randomBytes`, not `Math.random()` (predictable and unsuitable for anything representing money).
- **M-Pesa message paste fallback**: never auto-credits a device from free-text SMS content the customer could fake — it only queues the payment for manual admin review.

### Still worth doing before production
- Add HTTPS termination (via your host/reverse proxy) and enable `contentSecurityPolicy` in `src/app.js` for your real domain.
- Add structured logging/alerting (e.g. Sentry) instead of console-only logs.
- Add a cron job to expire `Device` records past `expiresAt` and call `router.service.unbindDevice()`.
- Consider 2FA for admin accounts if you'll have multiple staff logins.
- Rotate `JWT_SECRET` and `INTASEND_WEBHOOK_CHALLENGE` periodically.

## API overview

**Public**
- `GET /api/packages`
- `POST /api/stk-push` `{ name, phone, mac, packageId }`
- `GET /api/stk-status/:invoiceId`
- `GET /api/device-status/:mac`
- `POST /api/vouchers/activate` `{ code, phone, mac }`
- `POST /api/reconnect` `{ identifier }`
- `POST /api/verify-mpesa-message` `{ message, phone?, mac? }`
- `POST /api/webhooks/intasend` (IntaSend only)

**Auth**
- `POST /api/auth/login` `{ username, password }` → `{ token }`

**Admin** (require `Authorization: Bearer <token>`)
- `GET /api/admin/stats`
- `GET /api/admin/router-status`
- `GET /api/admin/devices?status=bound`
- `GET /api/admin/devices/failed`
- `POST /api/admin/devices/:id/retry-bind`
- `GET /api/admin/payments?status=paid`
- `GET /api/admin/mpesa-reviews?status=pending`
- `POST /api/admin/mpesa-reviews/:id/approve` `{ packageId, force? }`
- `POST /api/admin/mpesa-reviews/:id/reject` `{ note? }`
- `GET /api/admin/vouchers?status=unused`
- `POST /api/admin/vouchers` `{ packageId, quantity, batchLabel }`
- `POST /api/admin/packages` / `PUT /api/admin/packages/:id`

## M-Pesa message review queue

`POST /api/verify-mpesa-message` never auto-credits a device — it
persists the pasted message as a `MpesaReview` (status `pending`) so
it's an actual admin-visible queue, not just a reassuring string back
to the customer. In the admin panel, under "M-Pesa messages awaiting
review":

- **Approve & connect** — only enabled if the review has a MAC on
  file (captured client-side when the customer submitted it). Admin
  picks the package the customer says they paid for, confirms they've
  checked it against the real M-Pesa statement, and it binds the
  device exactly like a voucher redemption. If the extracted amount
  from the message doesn't match the chosen package's price, the
  approve is blocked with a mismatch warning (admin can override with
  `force: true` after reviewing — e.g. a promo price not yet reflected
  in the package). If the router bind then fails, the device lands in
  the failed-devices queue below instead of silently disappearing.
- **Reject** — for anything that doesn't check out; takes an optional
  note for the audit trail.

Reviews with no MAC on file (e.g. submitted from off the hotspot
network) can't be auto-connected — reject with a note asking the
customer to resubmit from the WiFi sign-in page.

## Failed router binds

If a payment or voucher succeeds but `router.service.bindDevice()`
throws, the `Device` lands in `status: 'failed'` — money was taken but
nothing got connected. These show up under "Needs attention" in the
admin panel with the router's error message and a **Retry bind**
button (`POST /api/admin/devices/:id/retry-bind`), so it doesn't
require touching Mongo directly to fix.

## Router health

`GET /api/admin/router-status` (surfaced as a status pill at the top
of the admin panel) confirms the app can actually reach and
authenticate to the configured MikroTik router right now, separate
from any individual bind/unbind call — so a down router is visible
before customers start reporting no internet.

## Frontend

`public/index.html` is already wired to this API (relative `/api` base
— same origin). Two things worth knowing:

- **CSP nonce**: the page has one inline `<script>` and one inline
  `<style>` block. `src/app.js` generates a per-request nonce and
  stamps it onto both when serving `/`, so the CSP can stay strict
  (no blanket `'unsafe-inline'`). If you ever split the JS/CSS into
  separate files, you can drop the nonce logic and just tighten
  `connect-src`/`script-src` to `'self'`.
- **Router/gateway detection**: `detectRouterType()` sniffs common
  MikroTik/CoovaChilli query-string conventions to show a friendlier
  "Connection: MikroTik hotspot" label and tailor the troubleshoot
  copy. This is cosmetic only — it never affects pricing, MAC
  binding, or payment (those always come from the router-supplied
  `mac` param and the backend). If nothing matches, the page falls
  back to letting the person pick their connection type manually.
- **TV / other device form**: fully wired to `/api/stk-push` +
  polling, same flow as the main package cards, for devices that
  can't open this page themselves (so no router-supplied MAC to
  autofill — the customer types it in).
- The old placeholder "Sign in with username/password" form was
  removed — this system has no customer accounts, only MAC-bound
  devices and vouchers, so that form never matched anything real.
  Returning customers use "Reconnect a device" (phone/voucher lookup)
  or the M-Pesa message queue instead.
