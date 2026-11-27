import { allowMethods, json, readJson } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';
import { deleteTicket, getTicket, listTickets, upsertTicket } from '../../lib/db.js';
import { validateTicket } from '../../lib/validate.js';

function queryValue(req, key) {
  const value = req?.query?.[key];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  try {
    return new URL(req?.url || '/', 'https://localhost').searchParams.get(key);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;
    if (!allowMethods(req, res, 'GET', 'POST', 'PATCH', 'DELETE')) return;

    const method = req.method.toUpperCase();

    if (method === 'GET') {
      return json(res, 200, { tickets: await listTickets() });
    }

    const body = await readJson(req);
    const payload = body.ticket && typeof body.ticket === 'object' ? body.ticket : body;

    if (method === 'POST') {
      let ticket;
      try {
        ticket = validateTicket(payload);
      } catch (error) {
        return json(res, 400, { error: 'INVALID_TICKET', message: error.message });
      }
      return json(res, 200, { ticket: await upsertTicket(ticket) });
    }

    const id = queryValue(req, 'id') || payload.id;
    if (!id) return json(res, 400, { error: 'MISSING_ID' });

    if (method === 'PATCH') {
      const existing = await getTicket(id);
      if (!existing) return json(res, 404, { error: 'NOT_FOUND' });

      let ticket;
      try {
        ticket = validateTicket({ ...existing, ...payload, id });
      } catch (error) {
        return json(res, 400, { error: 'INVALID_TICKET', message: error.message });
      }
      return json(res, 200, { ticket: await upsertTicket(ticket) });
    }

    await deleteTicket(id);
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'SERVER_ERROR' });
  }
}
