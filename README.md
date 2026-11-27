# TKT-PASS — hosted digital event pass

TKT-PASS is the hosted pass companion to the main TKT app. The main TKT backend remains the single source of truth for organizations, folders, events, people, tickets and pass state. This app is a thin Vercel frontend plus server-side BFF: browsers never talk to the main backend directly and never see its service credentials.

Guests open a personalized signed link from their email, see the approved event design, and may change only the preset/custom colors and a short memory quote. Name, attendee identity, ticket code, seat and event date are locked server-side.

## Live URLs

| Page | URL |
| --- | --- |
| Guest pass | `https://tkt-pass.vercel.app/pass?t=<signed-token>` |
| Pass admin | `https://tkt-pass.vercel.app/admin` |
| Main app | `https://ticketak.vercel.app` |
| Main backend | `https://tkt-backend.vercel.app` |

## How it works

1. A free reservation is auto-approved, or an admin approves a paid reservation.
2. The main backend queues a `PASS_ISSUED` outbox event. The handler mints a signed guest token, stores only its hash/session on the ticket, then posts to this app's internal email endpoint.
3. The email is sent from the configured Gmail sender with a `/pass?t=<token>` link. Delivery failures throw so the outbox retries with backoff.
4. The pass admin signs in through the **Continue with TKT** handoff from the main app, or with the master password fallback. It calls the main backend through this app's server-side BFF using a shared service token.
5. Admins filter org → folder → event, then review full people/ticket/pass analytics, preview, customize the event design, and resend passes.
6. The guest BFF verifies the token with the main backend, returns locked identity plus effective design, and saves only allowed color/quote edits.

Reservation tickets are pass-eligible only when `metadata.channel = "public"`, `approvalStatus = "APPROVED"`, status is not `CANCELLED`/`REFUNDED`, an attendee email exists, and `paymentStatus` is `CONFIRMED` or `NOT_REQUIRED`. Pending and rejected reservations stay visible in the admin filters but receive no pass email.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in the real values; never commit .env.local
npx vercel dev
```

Open `http://localhost:3000/admin` and sign in with `ADMIN_SECRET`, or use the handoff from the main app. To get a guest link, preview an eligible ticket from the admin; the preview route mints a short-lived signed token.

Smoke-check the configured Gmail transport without emailing a guest:

```bash
npm run test:send
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `TKT_API_BASE` | Main backend root URL, e.g. `https://tkt-backend.vercel.app` (no `/api` suffix) |
| `TKT_SERVICE_TOKEN` | Shared server-side token matching the backend's `PASS_SERVICE_TOKEN` |
| `TKT_HANDOFF_SECRET` | Shared secret matching the backend's `PASS_HANDOFF_SECRET` |
| `ADMIN_SECRET` | Master fallback password for `/admin` |
| `ADMIN_SESSION_SECRET` | Long random string used to sign the admin session cookie |
| `GMAIL_USER` | Sender address, e.g. `your.tkt.info@gmail.com` |
| `GMAIL_APP_PASSWORD` | Gmail App Password (spaces are stripped automatically) |
| `DAILY_SEND_LIMIT` | Maximum successful sends per Cairo day, default `400` |
| `SEND_DELAY_MS` | Pause between messages, default `1500` ms |
| `SITE_URL` | `https://tkt-pass.vercel.app` |

Guest tokens and handoff tokens are HS256 JWTs signed by the main backend. This app stores no raw tokens; the backend stores only their hashes/session IDs on the ticket.

## API contract

Browser calls (this app only):

| Endpoint | Purpose |
| --- | --- |
| `GET/POST /api/admin/auth` | Check session / master login |
| `GET /api/admin/handoff?token=` | Verify a signed TKT handoff and set the admin cookie |
| `GET /api/admin/explorer` | Organizations → folders → visible events |
| `GET /api/admin/analytics?eventId=` | Full event stats |
| `GET /api/admin/tickets?eventId=&approval=&passStatus=&q=` | People/tickets/pass table |
| `GET/PUT/POST /api/admin/design` | Read, save or reset the event pass design |
| `POST /api/admin/preview` | Mint a short-lived guest preview link |
| `POST /api/admin/send` | Queue resends with daily-cap enforcement |
| `GET /api/pass?t=` | Guest pass lookup via the backend |
| `POST /api/pass/design` | Save guest color/quote edits |

Internal/service calls:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/internal/pass-email` | Backend-only pass email delivery (`X-TKT-Service-Token`) |

The underlying main backend routes are `/passes/*` for admin access and `/public/passes/*` for service-token-only guest operations.

## Gmail setup

The sender uses Gmail SMTP (`smtp.gmail.com:465`, TLS) with an App Password:

1. Enable 2-Step Verification on the Google account.
2. Go to **2-Step Verification → App passwords**.
3. Create one for **Mail** and copy the 16-character password.
4. Set `GMAIL_USER` and `GMAIL_APP_PASSWORD`. Never use the normal Gmail password and never commit `.env.local`.

Personal Gmail accounts allow roughly 500 messages/day. This app defaults to a safer cap of 400/day with a 1.5-second delay between sends. Some guests may still see the message in Spam because the sender is a personal address.

## Guest flow

1. The email's **Open my pass** button opens `/pass?t=<signed-jwt>`.
2. The BFF verifies the token with the main backend and returns locked identity, QR data, seat, date and the effective design.
3. The guest picks a theme or custom colors and writes an optional memory quote. Changes autosave (debounced) to `POST /api/pass/design`.
4. **Copy share link** copies the same signed URL; the saved design is loaded from the main backend on any device.
5. **حفظ للمحفظة** exports the exact rendered pass as a wallet-style PNG using html2canvas.

Tampered links return `INVALID_LINK`; authentic expired links return `EXPIRED_LINK`.

## Deploy

The project is linked to Vercel as `tkt-pass`. `vercel deploy --prod --yes` from this folder publishes to `https://tkt-pass.vercel.app`. Keep `SITE_URL` exactly equal to that URL with no trailing slash. The previously requested `pass.ticketak.vercel.app` could not be assigned because Vercel does not allow subdomains of another project's generated `*.vercel.app` domain.

## Security notes

- The service token and handoff secret exist only in server-side Vercel environment variables.
- Guest identity is never read from query parameters; it comes from the verified backend response.
- Admin endpoints require a signed HttpOnly, SameSite=Lax cookie.
- Theme keys, hex colors and quote length are validated server-side. API responses are `no-store`.
- The Gmail app password lives only in environment variables / `.env.local`, never in source or the browser bundle.
