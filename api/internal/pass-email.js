import { createHash, timingSafeEqual } from 'node:crypto';
import { allowMethods, json, readJson } from '../../lib/http.js';
import { mainServiceApi } from '../../lib/main-api.js';
import { sendTicketEmail } from '../../lib/mail.js';

function assertService(req, res) {
  const supplied = req?.headers?.['x-tkt-service-token'];
  const expected = process.env.TKT_SERVICE_TOKEN;
  if (!expected || typeof supplied !== 'string') {
    json(res, 401, { error: 'UNAUTHORIZED' });
    return false;
  }
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(expected).digest();
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    json(res, 401, { error: 'UNAUTHORIZED' });
    return false;
  }
  return true;
}

function intEnv(value, fallback, allowZero = false) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return allowZero ? Math.max(0, n) : Math.max(1, n);
}

export default async function handler(req, res) {
  try {
    if (!allowMethods(req, res, 'POST')) return;
    if (!assertService(req, res)) return;

    const body = await readJson(req);
    const { token, ticketId, to, name, seat, eventTitle, eventDate } = body;
    if (!token || !to || !ticketId) {
      return json(res, 400, { error: 'MISSING_DELIVERY_FIELDS' });
    }

    const limit = intEnv(process.env.DAILY_SEND_LIMIT, 400, true);
    const { sentToday } = await mainServiceApi('/public/passes/delivery-count');
    if (Number(sentToday || 0) >= limit) {
      // A non-2xx makes the main backend's outbox retry with backoff.
      return json(res, 429, { error: 'DAILY_LIMIT_REACHED', sentToday, limit });
    }

    const messageId = await sendTicketEmail({
      to,
      name,
      ticketId,
      seat,
      eventTitle,
      eventDate,
      token,
    });

    return json(res, 200, { ok: true, messageId });
  } catch (error) {
    console.error('pass email delivery failed:', error?.message || error);
    return json(res, 502, { error: 'EMAIL_DELIVERY_FAILED', message: error.message });
  }
}
