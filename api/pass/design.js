import { allowMethods, json, readJson } from '../../lib/http.js';
import { verifyTicketToken } from '../../lib/jwt.js';
import { saveDesign } from '../../lib/db.js';
import { validateDesign } from '../../lib/validate.js';

export default async function handler(req, res) {
  try {
    if (!allowMethods(req, res, 'POST')) return;

    const body = await readJson(req);
    const token = body.t || req?.query?.t;
    if (!token) return json(res, 401, { error: 'UNAUTHORIZED' });

    const payload = await verifyTicketToken(token);
    if (!payload) return json(res, 401, { error: 'UNAUTHORIZED' });

    let design;
    try {
      design = validateDesign(body.design);
    } catch (error) {
      return json(res, 400, {
        error: 'INVALID_DESIGN',
        message: error.message,
      });
    }

    const saved = await saveDesign(payload.tid, design);
    return json(res, 200, { ok: true, updatedAt: saved.updatedAt });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'SERVER_ERROR' });
  }
}
