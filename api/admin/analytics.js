import { allowMethods, json } from '../../lib/http.js';
import { getAdminActor, requireAdmin } from '../../lib/auth.js';
import { mainServiceApi } from '../../lib/main-api.js';

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
    if (!allowMethods(req, res, 'GET')) return;
    if (!(await requireAdmin(req, res))) return;

    const eventId = queryValue(req, 'eventId');
    if (!eventId) return json(res, 400, { error: 'MISSING_EVENT_ID' });

    const actor = await getAdminActor(req);
    const data = await mainServiceApi(`/passes/events/${encodeURIComponent(eventId)}/analytics`, { actor });
    return json(res, 200, data);
  } catch (error) {
    console.error('pass analytics failed:', error?.message || error);
    return json(res, error.status || 500, { error: 'PASS_API_ERROR', message: error.message });
  }
}
