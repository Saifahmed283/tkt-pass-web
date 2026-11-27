import { allowMethods, json, readJson } from '../../lib/http.js';
import { getAdminActor, requireAdmin } from '../../lib/auth.js';
import { mainServiceApi } from '../../lib/main-api.js';
import { validateDesign } from '../../lib/validate.js';

export default async function handler(req, res) {
  try {
    if (!allowMethods(req, res, 'GET', 'PUT', 'POST')) return;
    if (!(await requireAdmin(req, res))) return;

    const actor = await getAdminActor(req);
    const method = String(req.method).toUpperCase();

    if (method === 'GET') {
      const eventId = req?.query?.eventId;
      if (typeof eventId !== 'string' || !eventId) {
        return json(res, 400, { error: 'MISSING_EVENT_ID' });
      }
      const data = await mainServiceApi(`/passes/events/${encodeURIComponent(eventId)}/design`, { actor });
      return json(res, 200, data);
    }

    const body = await readJson(req);
    const eventId = body.eventId;
    if (typeof eventId !== 'string' || !eventId) {
      return json(res, 400, { error: 'MISSING_EVENT_ID' });
    }

    if (method === 'PUT') {
      let design;
      try {
        design = validateDesign(body.design);
      } catch (error) {
        return json(res, 400, { error: 'INVALID_DESIGN', message: error.message });
      }
      const data = await mainServiceApi(`/passes/events/${encodeURIComponent(eventId)}/design`, {
        method: 'PUT',
        actor,
        body: { design, resetTickets: body.resetTickets === true },
      });
      return json(res, 200, data);
    }

    const data = await mainServiceApi(`/passes/events/${encodeURIComponent(eventId)}/design/reset`, {
      method: 'POST',
      actor,
      body: {},
    });
    return json(res, 200, data);
  } catch (error) {
    console.error('pass design failed:', error?.message || error);
    return json(res, error.status || 500, { error: 'PASS_API_ERROR', message: error.message });
  }
}
