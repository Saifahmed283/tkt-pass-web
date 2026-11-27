import { allowMethods, json, readJson } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';
import { countSentToday, listTickets, logSend, markSent } from '../../lib/db.js';
import { signTicketToken } from '../../lib/jwt.js';
import { sendTicketEmail } from '../../lib/mail.js';

function intEnv(value, fallback, allowZero = false) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return allowZero ? Math.max(0, n) : Math.max(1, n);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBatchStopper(error) {
  const code = String(error?.code || error?.responseCode || '');
  const message = String(error?.message || error || '').toLowerCase();
  if (['EAUTH', 'ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNRESET'].includes(code)) return true;
  return [
    'rate limit',
    'too many',
    'quota',
    'daily sending',
    'temporarily unavailable',
    '4.7.0',
    '421',
    '450',
    '451',
    '452',
    '535',
  ].some((needle) => message.includes(needle));
}

export default async function handler(req, res) {
  try {
    if (!allowMethods(req, res, 'POST')) return;
    if (!(await requireAdmin(req, res))) return;

    const body = await readJson(req);
    const tickets = await listTickets();
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;

    let targets = [];
    if (body.all === true) {
      // "Send remaining" only targets tickets that have never been sent.
      targets = tickets.filter((ticket) => !ticket.sentAt);
    } else if (ids && ids.length) {
      // Selecting rows explicitly allows a deliberate resend.
      targets = tickets.filter((ticket) => ids.includes(String(ticket.id)));
    }

    if (!targets.length) {
      return json(res, 200, {
        results: [],
        skipped: [],
        sent: 0,
        failed: 0,
        remaining: 0,
        capReached: false,
        stopped: false,
        dailyLimit: intEnv(process.env.DAILY_SEND_LIMIT, 400, true),
        sentToday: await countSentToday(),
      });
    }

    const dailyLimit = intEnv(process.env.DAILY_SEND_LIMIT, 400, true);
    const delayMs = intEnv(process.env.SEND_DELAY_MS, 1500, true);
    const alreadySentToday = await countSentToday();
    let capacity = Math.max(0, dailyLimit - alreadySentToday);

    const results = [];
    const skipped = [];
    let stopped = false;

    if (capacity === 0) {
      skipped.push(...targets.map((ticket) => ({ id: ticket.id, reason: 'DAILY_LIMIT_REACHED' })));
    } else {
      for (let index = 0; index < targets.length; index += 1) {
        if (capacity <= 0) {
          skipped.push(...targets.slice(index).map((ticket) => ({ id: ticket.id, reason: 'DAILY_LIMIT_REACHED' })));
          break;
        }

        const ticket = targets[index];
        try {
          const token = await signTicketToken({ ticketId: ticket.id, endsAt: ticket.endsAt });
          const providerId = await sendTicketEmail({
            to: ticket.email,
            name: ticket.name,
            ticketId: ticket.id,
            seat: ticket.seat,
            eventTitle: ticket.eventTitle,
            eventDate: ticket.eventDate,
            token,
          });
          await logSend(ticket.id, 'ok', providerId, null);
          await markSent(ticket.id);
          results.push({ id: ticket.id, ok: true });
          capacity -= 1;
        } catch (error) {
          const message = error?.message || String(error);
          await logSend(ticket.id, 'error', null, message);
          results.push({ id: ticket.id, ok: false, error: message });
          if (isBatchStopper(error)) {
            stopped = true;
            skipped.push(...targets.slice(index + 1).map((item) => ({ id: item.id, reason: 'BATCH_STOPPED' })));
            break;
          }
        }

        const hasMore = index < targets.length - 1;
        if (hasMore && !stopped && capacity > 0 && delayMs > 0) {
          await sleep(delayMs);
        }
      }
    }

    const sent = results.filter((result) => result.ok).length;
    const failed = results.length - sent;
    const capReached = !stopped && capacity <= 0 && skipped.length > 0;

    return json(res, 200, {
      results,
      skipped,
      sent,
      failed,
      remaining: skipped.length,
      capReached,
      stopped,
      dailyLimit,
      sentToday: alreadySentToday + sent,
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'SERVER_ERROR' });
  }
}
