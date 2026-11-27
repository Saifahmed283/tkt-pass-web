import { SignJWT, jwtVerify, decodeJwt } from 'jose';
import { randomUUID } from 'node:crypto';

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

function ticketSecret() {
  return new TextEncoder().encode(process.env.TICKET_SIGNING_SECRET || '');
}

function adminSecret() {
  return new TextEncoder().encode(
    process.env.ADMIN_SESSION_SECRET || process.env.TICKET_SIGNING_SECRET || '',
  );
}

export async function signTicketToken({ ticketId, endsAt, maxAgeSeconds } = {}) {
  if (!ticketId) throw new Error('MISSING_TICKET_ID');

  const now = Math.floor(Date.now() / 1000);
  let exp;

  if (Number.isFinite(Number(maxAgeSeconds))) {
    exp = now + Math.floor(Number(maxAgeSeconds));
  } else {
    const endMs = endsAt ? new Date(endsAt).getTime() : NaN;
    const endSeconds = Number.isFinite(endMs) ? Math.floor(endMs / 1000) : null;
    exp = endSeconds ? Math.min(endSeconds + DAY, now + 30 * DAY) : now + 30 * DAY;
    exp = Math.max(exp, now + HOUR);
  }

  return new SignJWT({ tid: String(ticketId), jti: randomUUID() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(ticketSecret());
}

export async function verifyTicketToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const { payload } = await jwtVerify(token, ticketSecret(), { algorithms: ['HS256'] });
    return payload?.tid && typeof payload.tid === 'string' ? payload : null;
  } catch {
    return null;
  }
}

// Non-verifying decode, used only to distinguish expired links from bad links.
export function decodeTicketToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    return decodeJwt(token);
  } catch {
    return null;
  }
}

export async function signAdminSession() {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + 8 * HOUR)
    .sign(adminSecret());
}

export async function verifyAdminSession(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const { payload } = await jwtVerify(token, adminSecret(), { algorithms: ['HS256'] });
    return payload?.role === 'admin' ? payload : null;
  } catch {
    return null;
  }
}
