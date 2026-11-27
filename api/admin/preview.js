import { allowMethods, json } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';
import { signTicketToken } from '../../lib/jwt.js';

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

    const id = queryValue(req, 'id');
    if (!id) return json(res, 400, { error: 'MISSING_ID' });

    const token = await signTicketToken({ ticketId: id, maxAgeSeconds: 600 });
    return json(res, 200, { token });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'SERVER_ERROR' });
  }
}
