# TKT-PASS — website edition

A hosted version of the Wadi Degla event pass. Guests open a personalized, signed link from their email, see the same pass design you approved, and can only change the colors and their memory quote. Name, seat, and ticket code are locked server-side.

## Stack

- **Frontend:** the original single-page HTML/CSS/JS pass + an organizer admin dashboard (no build step)
- **Hosting:** Vercel — public URL `https://tkt-pass.vercel.app`
- **Database:** Neon Postgres
- **Email:** Gmail SMTP via Nodemailer (`smtp.gmail.com`, port 465, TLS)
- **Auth:** signed HS256 JWT for guest links, shared-password + signed HttpOnly cookie for admin

## Live URLs (after deployment)

| Page | URL |
| --- | --- |
| Guest pass | `https://tkt-pass.vercel.app/pass?t=<signed-token>` |
| Admin dashboard | `https://tkt-pass.vercel.app/admin` |

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. `.env.local` is already filled with the Neon connection string, generated secrets, and the Gmail sender settings. It is git-ignored — never commit it.

3. The Neon database has already been created and seeded with three demo tickets. To recreate from scratch, run:

   ```bash
   psql "$DATABASE_URL" -f schema.sql
   ```

4. Start the local dev server (requires Vercel CLI login):

   ```bash
   npx vercel dev
   ```

   Local URLs: `http://localhost:3000/pass?t=<token>` and `http://localhost:3000/admin`.

   To get a valid test token, log in to `/admin`, open **Preview** next to a ticket, or call `GET /api/admin/preview?id=TKT-26001` with the admin cookie.

   Alternatively, run a minimal local API server without Vercel CLI and test the full flow:

   ```bash
   node scripts/local-server.mjs      # terminal 1
   node scripts/smoke.mjs             # terminal 2 — core helpers + DB
   node scripts/e2e.mjs               # terminal 2 — auth, preview, guest pass, design save, CSV import
   ```

   `e2e.mjs` adds one test ticket (`TKT-99999`) and temporarily changes the demo design; restore or delete it before a real send.

5. Send one real test email to the configured Gmail address itself:

   ```bash
   npm run test:send
   ```

   This does **not** email a guest. Check the Gmail inbox for a `TKT-PASS` message with the **Open my pass** button.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres pooled connection string |
| `TICKET_SIGNING_SECRET` | Signs guest ticket JWTs (32+ chars) |
| `ADMIN_SECRET` | Shared password for `/admin` |
| `ADMIN_SESSION_SECRET` | Signs the admin session cookie |
| `GMAIL_USER` | Gmail address used to send, e.g. `your.tkt.info@gmail.com` |
| `GMAIL_APP_PASSWORD` | 16-character Gmail App Password (spaces are stripped automatically) |
| `DAILY_SEND_LIMIT` | Max successful sends per Cairo day, default `400` |
| `SEND_DELAY_MS` | Pause between messages, default `1500` ms |
| `SITE_URL` | `https://tkt-pass.vercel.app` |

## Gmail setup

The app password is already set in `.env.local`. If you need to recreate or rotate it:

1. Open <https://myaccount.google.com/security>.
2. Turn on **2-Step Verification** if it is not already enabled.
3. Go to **2-Step Verification → App passwords**.
4. Generate one for **Mail** on your computer. Google shows a 16-character password (often with spaces).
5. Put it in `GMAIL_APP_PASSWORD`. Spaces are removed in code, so the displayed format is accepted.
6. Never use your normal Gmail password here, and never commit `.env.local`.

Gmail personal accounts allow roughly **500 sent messages/day**. This app defaults to a safer cap of **400/day** and pauses 1.5 seconds between messages. Some guests may still see the email in Spam because it comes from a personal address.

## Sending behavior

- **إرسال المتبقي / Send remaining** sends only tickets with no `sent_at`. Safe to click repeatedly.
- **إرسال المحدد / Send selected** force-sends the selected tickets, even if they were sent before. Use this for one resend or a corrected email address.
- Each run stops at `DAILY_SEND_LIMIT` successful sends (counted per Cairo day in `send_log`). Remaining tickets are reported and can be sent the next day.
- If Gmail returns an auth, timeout, or rate-limit error, the batch stops cleanly and reports what was not sent instead of failing every ticket.
- Results show sent / failed / remaining counts plus a per-ticket list.

## Attendee CSV

Use `attendees-template.csv` as the format. Required columns: `ticket_id`, `holder_name`, `email`, `seat`. Optional: `event_title`, `event_subtitle`, `location`, `event_date`, `starts_at`, `ends_at`. Rows with duplicate `ticket_id` are updated, not duplicated.

Import from the admin dashboard: **Import CSV** → choose file → review counts/errors.

## Guest flow

1. Admin sends a ticket from `/admin` (remaining or selected). Gmail delivers a `TKT-PASS` email with an **Open my pass** button.
2. Button opens `/pass?t=<signed-jwt>`. The API verifies the signature and returns the locked identity plus saved design from Neon.
3. Guest picks a preset or custom colors and writes a quote. Changes autosave (debounced) to `POST /api/pass/design`.
4. **Copy share link** copies the same signed URL; the design comes from the database, so it looks identical on any device.
5. **حفظ للمحفظة** exports the exact rendered pass as a PNG using html2canvas. The gate QR stays based on locked ticket data.

## API contract

| Endpoint | Purpose |
| --- | --- |
| `GET /api/pass?t=` | Verify token, return locked ticket + design, mark opened |
| `POST /api/pass/design` | Save `{t, design:{theme,header,accent,quote}}` |
| `POST/GET /api/admin/auth` | Login / check session |
| `POST /api/admin/logout` | Logout |
| `GET/POST/PATCH/DELETE /api/admin/tickets` | Ticket CRUD |
| `POST /api/admin/import` | CSV import |
| `GET /api/admin/preview?id=` | Short-lived preview token |
| `POST /api/admin/send` | `{all:true}` or `{ids:[...], force:true}`; returns `{results, skipped, sent, failed, remaining, capReached, stopped, dailyLimit, sentToday}` |
| `GET /api/admin/stats` | Dashboard counts |

## Deploy to Vercel

1. Push this folder to a Git repository.
2. In Vercel, **Add New → Project**, import that repository. Set **Framework Preset: Other**. Leave the build command empty; `vercel.json` sets `public` as the output directory.
3. Add all environment variables from the table above under **Settings → Environment Variables**. Do **not** add `RESEND_API_KEY` or `EMAIL_FROM` — those are no longer used.
4. The live Vercel URL is `https://tkt-pass.vercel.app`. The requested `pass.ticketak.vercel.app` could not be assigned because Vercel does not allow subdomains of another project's generated `*.vercel.app` domain. To use that exact URL, you would need a domain you own with DNS access.
5. Deploy. Confirm `SITE_URL` exactly matches the final URL, including `https://` and no trailing slash.

## Security notes

- Guest tickets are signed with HS256; edited URLs fail closed to an invalid screen.
- Identity is never read from query parameters by the pass page — it always comes from the verified API response.
- Admin endpoints require a signed HttpOnly, SameSite=Lax cookie.
- Theme keys, hex colors, and quote length are validated server-side. API responses are `no-store`.
- The Gmail app password lives only in environment variables / `.env.local`, never in source or the browser bundle.
