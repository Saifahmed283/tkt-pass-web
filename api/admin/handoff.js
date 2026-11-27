import { allowMethods } from '../../lib/http.js';
import { setAdminCookie } from '../../lib/auth.js';
import { verifyHandoffToken } from '../../lib/handoff.js';

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

    const actor = await verifyHandoffToken(queryValue(req, 'token'));
    if (!actor) {
      res.statusCode = 302;
      res.setHeader('Location', '/admin?handoff=error');
      res.setHeader('Cache-Control', 'no-store');
      res.end();
      return;
    }

    await setAdminCookie(res, actor);
    res.statusCode = 302;
    res.setHeader('Location', '/admin');
    res.setHeader('Cache-Control', 'no-store');
    res.end();
  } catch (error) {
    console.error('handoff failed:', error?.message || error);
    res.statusCode = 302;
    res.setHeader('Location', '/admin?handoff=error');
    res.setHeader('Cache-Control', 'no-store');
    res.end();
  }
}
