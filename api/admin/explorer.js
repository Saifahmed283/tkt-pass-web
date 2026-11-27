import { allowMethods, json } from '../../lib/http.js';
import { getAdminActor, requireAdmin } from '../../lib/auth.js';
import { mainServiceApi } from '../../lib/main-api.js';

export default async function handler(req, res) {
  try {
    if (!allowMethods(req, res, 'GET')) return;
    if (!(await requireAdmin(req, res))) return;

    const actor = await getAdminActor(req);
    const data = await mainServiceApi('/passes/explorer', { actor });
    return json(res, 200, data);
  } catch (error) {
    console.error('pass explorer failed:', error?.message || error);
    return json(res, error.status || 500, { error: 'PASS_API_ERROR', message: error.message });
  }
}
