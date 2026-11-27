import { allowMethods, json, readJson } from '../../lib/http.js';
import { mainServiceApi } from '../../lib/main-api.js';
import { validateDesign } from '../../lib/validate.js';

export default async function handler(req, res) {
  try {
    if (!allowMethods(req, res, 'POST')) return;

    const body = await readJson(req);
    const token = body.t || req?.query?.t;
    if (!token || typeof token !== 'string') {
      return json(res, 400, { error: 'INVALID_LINK' });
    }

    let design;
    try {
      design = validateDesign(body.design);
    } catch (error) {
      return json(res, 400, { error: 'INVALID_DESIGN', message: error.message });
    }

    const result = await mainServiceApi('/public/passes/design', {
      method: 'POST',
      body: { t: token, design },
    });

    if (result?.error) {
      const expired = result.error === 'EXPIRED_LINK';
      return json(res, expired ? 410 : 401, {
        error: expired ? 'EXPIRED_LINK' : 'INVALID_LINK',
      });
    }

    return json(res, 200, { ok: true });
  } catch (error) {
    console.error('pass design save failed:', error?.message || error);
    return json(res, 500, { error: 'SERVER_ERROR' });
  }
}
