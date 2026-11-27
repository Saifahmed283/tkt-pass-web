import { allowMethods, json, readJson } from '../../lib/http.js';
import { getAdminActor, requireAdmin } from '../../lib/auth.js';
import { mainServiceApi } from '../../lib/main-api.js';

export default async function handler(req, res) {
  try {
    if (!allowMethods(req, res, 'POST')) return;
    if (!(await requireAdmin(req, res))) return;

    const body = await readJson(req);
    const ticketId = body.ticketId;
    if (typeof ticketId !== 'string' || !ticketId) {
      return json(res, 400, { error: 'MISSING_TICKET_ID' });
    }

    const actor = await getAdminActor(req);
    const data = await mainServiceApi(`/passes/tickets/${encodeURIComponent(ticketId)}/preview`, {
      method: 'POST',
      actor,
      body: {},
    });
    return json(res, 200, data);
  } catch (error) {
    console.error('pass preview failed:', error?.message || error);
    return json(res, error.status || 500, { error: 'PASS_API_ERROR', message: error.message });
  }
}
