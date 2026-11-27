import { createHash, timingSafeEqual } from 'node:crypto';
import { allowMethods, json, readJson } from '../../lib/http.js';
import { getCookie, setAdminCookie } from '../../lib/auth.js';
import { verifyAdminSession } from '../../lib/jwt.js';

function matches(password, expected) {
  if (!expected) return false;
  const a = createHash('sha256').update(String(password ?? '')).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  try {
    if (!allowMethods(req, res, 'GET', 'POST')) return;

    if (String(req.method).toUpperCase() === 'GET') {
      const token = getCookie(req, process.env.ADMIN_COOKIE || 'tkt_admin');
      const payload = await verifyAdminSession(token);
      return json(res, 200, { authenticated: payload !== null });
    }

    const body = await readJson(req);
    if (!matches(body.password, process.env.ADMIN_SECRET)) {
      return json(res, 401, { error: 'UNAUTHORIZED' });
    }

    await setAdminCookie(res);
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'SERVER_ERROR' });
  }
}
