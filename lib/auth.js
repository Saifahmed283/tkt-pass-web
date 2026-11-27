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

export async function setAdminCookie(res, profile = { master: true }) {
  const token = await signAdminSession(profile);
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

export async function getAdminSession(req) {
  const token = getCookie(req, cookieName());
  return verifyAdminSession(token);
}

export async function requireAdmin(req, res) {
  const payload = await getAdminSession(req);
  if (!payload) {
    json(res, 401, { error: 'UNAUTHORIZED' });
    return false;
  }
  return true;
}

export async function getAdminActor(req) {
  const payload = await getAdminSession(req);
  if (!payload) return null;
  return {
    master: payload.master === true,
    userId: payload.uid || null,
    platformRole: payload.platformRole || null,
    orgRole: payload.orgRole || null,
    name: payload.name || null,
    email: payload.email || null,
  };
}
