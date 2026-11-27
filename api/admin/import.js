import { allowMethods, json, readJson } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';
import { upsertTicket } from '../../lib/db.js';
import { validateTicket } from '../../lib/validate.js';

const MAX_ROWS = 2000;
const REQUIRED = ['ticket_id', 'holder_name', 'email', 'seat'];

// Minimal RFC-4180 style parser: quoted fields, embedded commas/newlines and
// escaped double quotes (""). No external dependency.
export function parseCsv(input) {
  const text = String(input ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ''));
}

export default async function handler(req, res) {
  try {
    if (!allowMethods(req, res, 'POST')) return;
    if (!(await requireAdmin(req, res))) return;

    const body = await readJson(req);
    if (typeof body.csv !== 'string') {
      return json(res, 400, { error: 'INVALID_CSV', message: 'csv must be a string' });
    }

    const rows = parseCsv(body.csv);
    if (!rows.length) {
      return json(res, 400, { error: 'INVALID_CSV', message: 'csv is empty' });
    }

    const headers = rows[0].map((cell) => String(cell).trim().toLowerCase());
    const missing = REQUIRED.filter((header) => !headers.includes(header));
    if (missing.length) {
      return json(res, 400, {
        error: 'INVALID_CSV',
        message: `Missing headers: ${missing.join(', ')}`,
      });
    }

    const result = { imported: 0, skipped: 0, errors: [] };

    for (let i = 1; i < rows.length; i += 1) {
      const rowNumber = i + 1;
      if (result.imported >= MAX_ROWS) {
        result.skipped += 1;
        result.errors.push({ row: rowNumber, message: 'ROW_LIMIT_EXCEEDED' });
        continue;
      }

      const record = {};
      headers.forEach((header, index) => {
        if (!header) return;
        const value = rows[i][index] ?? '';
        if (header === 'design' && typeof value === 'string' && value.trim()) {
          try {
            record[header] = JSON.parse(value);
            return;
          } catch {
            // Leave it as text so validateTicket reports the bad row.
          }
        }
        record[header] = value;
      });

      try {
        await upsertTicket(validateTicket(record));
        result.imported += 1;
      } catch (error) {
        result.skipped += 1;
        result.errors.push({ row: rowNumber, message: error.message || 'INVALID_TICKET' });
      }
    }

    return json(res, 200, result);
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'SERVER_ERROR' });
  }
}
