import { allowMethods, json } from '../../lib/http.js';
import { clearAdminCookie } from '../../lib/auth.js';

export default async function handler(req, res) {
  try {
    if (!allowMethods(req, res, 'POST')) return;

    clearAdminCookie(res);
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'SERVER_ERROR' });
  }
}
