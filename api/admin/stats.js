import { allowMethods, json } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';
import { sql } from '../../lib/db.js';

export default async function handler(req, res) {
  try {
    if (!allowMethods(req, res, 'GET')) return;
    if (!(await requireAdmin(req, res))) return;

    const rows = await sql`
      select
        count(*)::int as total,
        count(*) filter (where sent_at is not null)::int as sent,
        count(*) filter (where opened_at is not null)::int as opened,
        count(*) filter (where (design ->> 'quote') <> '' or design ? 'header')::int as customized
      from tickets
    `;

    const row = rows[0] || {};
    return json(res, 200, {
      total: Number(row.total || 0),
      sent: Number(row.sent || 0),
      opened: Number(row.opened || 0),
      customized: Number(row.customized || 0),
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'SERVER_ERROR' });
  }
}
