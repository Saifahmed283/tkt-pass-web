import { SignJWT, jwtVerify } from 'jose';

const HOUR = 60 * 60;

function adminSecret() {
  return new TextEncoder().encode(process.env.ADMIN_SESSION_SECRET || '');
}

// Admin sessions are local to the pass app. Guest and handoff JWTs are minted
// and verified by the main TKT backend; this app never signs guest tokens.
export async function signAdminSession(profile = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    role: 'admin',
    master: profile.master === true,
    uid: typeof profile.userId === 'string' ? profile.userId : null,
    name: typeof profile.name === 'string' ? profile.name : null,
    email: typeof profile.email === 'string' ? profile.email : null,
    platformRole: typeof profile.platformRole === 'string' ? profile.platformRole : null,
    orgRole: typeof profile.orgRole === 'string' ? profile.orgRole : null,
  })
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
