import { allowMethods, json } from '../lib/http.js';
import { mainServiceApi } from '../lib/main-api.js';
import { validateDesign } from '../lib/validate.js';

function queryValue(req, key) {
  const fromQuery = req?.query?.[key];
  if (typeof fromQuery === 'string') return fromQuery;
  if (Array.isArray(fromQuery) && typeof fromQuery[0] === 'string') return fromQuery[0];
  try {
    return new URL(req?.url || '/', 'https://localhost').searchParams.get(key);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    if (!allowMethods(req, res, 'GET')) return;

    const token = queryValue(req, 't');
    if (!token) return json(res, 400, { error: 'INVALID_LINK' });

    const params = new URLSearchParams({ t: token });
    const result = await mainServiceApi(`/public/passes/guest?${params.toString()}`);

    if (result?.error) {
      const expired = result.error === 'EXPIRED_LINK';
      return json(res, expired ? 410 : 401, {
        error: expired ? 'EXPIRED_LINK' : 'INVALID_LINK',
      });
    }

    return json(res, 200, {
      ...result,
      design: validateDesign(result.design),
    });
  } catch (error) {
    console.error('pass lookup failed:', error?.message || error);
    if (error.status === 401 || error.status === 410) {
      return json(res, error.status, { error: error.status === 410 ? 'EXPIRED_LINK' : 'INVALID_LINK' });
    }
    return json(res, 500, { error: 'SERVER_ERROR' });
  }
}
