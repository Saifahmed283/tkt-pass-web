import { jwtVerify } from 'jose';

const ISSUER = 'tkt-backend';
const AUDIENCE = 'tkt-pass';
const HANDOFF_TYPE = 'tkt_pass_handoff';

function secret() {
  return new TextEncoder().encode(process.env.TKT_HANDOFF_SECRET || '');
}

export async function verifyHandoffToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (payload?.typ !== HANDOFF_TYPE || typeof payload.uid !== 'string') return null;

    return {
      master: false,
      userId: payload.uid,
      name: typeof payload.name === 'string' ? payload.name : '',
      email: typeof payload.email === 'string' ? payload.email : '',
      platformRole: typeof payload.platformRole === 'string' ? payload.platformRole : null,
      orgRole: typeof payload.orgRole === 'string' ? payload.orgRole : null,
    };
  } catch {
    return null;
  }
}
