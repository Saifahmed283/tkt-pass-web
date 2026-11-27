import { json } from './http.js';
import { signAdminSession, verifyAdminSession } from './jwt.js';

const MAX_AGE_SECONDS = 8 * 60 * 60;

function cookieName() {
  return process.env.ADMIN_COOKIE || 'tkt_admin';
}

export function getCookie(req, name) {
  const header = req?.headers?.cookie;
  if (typeof header !== 'string' || !header) return null;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const raw = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export async function setAdminCookie(res) {
  const token = await signAdminSession();
  res.setHeader?.(
    'Set-Cookie',
    `${cookieName()}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${MAX_AGE_SECONDS}`,
  );
}

export function clearAdminCookie(res) {
  res.setHeader?.(
    'Set-Cookie',
    `${cookieName()}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
  );
}

export async function requireAdmin(req, res) {
  const token = getCookie(req, cookieName());
  const payload = await verifyAdminSession(token);
  if (!payload) {
    json(res, 401, { error: 'UNAUTHORIZED' });
    return false;
  }
  return true;
}
