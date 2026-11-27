import { allowMethods, json, readJson } from '../../lib/http.js';
import { getAdminActor, requireAdmin } from '../../lib/auth.js';
import { mainServiceApi } from '../../lib/main-api.js';

function intEnv(value, fallback, allowZero = false) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return allowZero ? Math.max(0, n) : Math.max(1, n);
}

export default async function handler(req, res) {
  try {
    if (!allowMethods(req, res, 'POST')) return;
    if (!(await requireAdmin(req, res))) return;

    const body = await readJson(req);
    const actor = await getAdminActor(req);
    const dailyLimit = intEnv(process.env.DAILY_SEND_LIMIT, 400, true);
    const delayMs = intEnv(process.env.SEND_DELAY_MS, 1500, true);
    const { sentToday } = await mainServiceApi('/public/passes/delivery-count');
    const capacity = Math.max(0, dailyLimit - Number(sentToday || 0));

    let requestedIds = Array.isArray(body.ids)
      ? [...new Set(body.ids.map(String).filter(Boolean))]
      : [];

    if (requestedIds.length === 0 && typeof body.eventId === 'string' && body.eventId) {
      const params = new URLSearchParams({ approval: 'APPROVED', passStatus: 'ALL' });
      if (typeof body.q === 'string' && body.q.trim()) params.set('q', body.q.trim());
      const data = await mainServiceApi(
        `/passes/events/${encodeURIComponent(body.eventId)}/tickets?${params.toString()}`,
        { actor },
      );
      requestedIds = (data.tickets || [])
        .filter((ticket) => ticket.eligible && ticket.passStatus !== 'DELIVERED')
        .map((ticket) => ticket.id);
    }

    if (requestedIds.length === 0) {
      return json(res, 200, {
        queued: 0,
        skipped: [],
        sentToday: Number(sentToday || 0),
        dailyLimit,
        delayMs,
        capReached: false,
      });
    }

    if (capacity === 0) {
      return json(res, 200, {
        queued: 0,
        skipped: requestedIds.map((id) => ({ id, reason: 'DAILY_LIMIT_REACHED' })),
        sentToday: Number(sentToday || 0),
        dailyLimit,
        delayMs,
        capReached: true,
      });
    }

    const acceptedIds = requestedIds.slice(0, capacity);
    const skipped = requestedIds.slice(capacity).map((id) => ({ id, reason: 'DAILY_LIMIT_REACHED' }));
    const result = await mainServiceApi('/passes/tickets/resend', {
      method: 'POST',
      actor,
      body: { ids: acceptedIds },
    });

    return json(res, 200, {
      queued: acceptedIds.length,
      outboxEventIds: result?.data?.outboxEventIds || [],
      skipped,
      sentToday: Number(sentToday || 0),
      dailyLimit,
      delayMs,
      capReached: skipped.length > 0,
    });
  } catch (error) {
    console.error('pass send queue failed:', error?.message || error);
    return json(res, error.status || 500, { error: 'PASS_API_ERROR', message: error.message });
  }
}
