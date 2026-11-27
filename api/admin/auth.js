import { createHash, timingSafeEqual } from 'node:crypto';
import { allowMethods, json, readJson } from '../../lib/http.js';
import { getAdminActor, setAdminCookie } from '../../lib/auth.js';

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
      const actor = await getAdminActor(req);
      return json(res, 200, {
        authenticated: Boolean(actor),
        actor: actor
          ? {
              master: actor.master,
              name: actor.name,
              email: actor.email,
              platformRole: actor.platformRole,
              orgRole: actor.orgRole,
            }
          : null,
      });
    }

    const body = await readJson(req);
    if (!matches(body.password, process.env.ADMIN_SECRET)) {
      return json(res, 401, { error: 'UNAUTHORIZED' });
    }

    await setAdminCookie(res, { master: true, name: 'Master admin' });
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error('admin auth failed:', error?.message || error);
    return json(res, 500, { error: 'SERVER_ERROR' });
  }
}
