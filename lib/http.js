// Shared HTTP helpers for Vercel Node serverless handlers.
//
// Usage:
//   import { allowMethods, json, readJson } from '../lib/http.js';
//
//   export default async function handler(req, res) {
//     if (!allowMethods(req, res, 'GET')) return; // sends 405 and ends the response
//     const body = await readJson(req);
//     return json(res, 200, { ok: true });
//   }
//
// `allowMethods` accepts (req, res, ...methods). It also tolerates the older
// (res, ...methods) shape by falling back to res.req when present.

export async function readJson(req) {
  // Some Vercel runtimes pre-parse the body for us.
  if (req?.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body;
  }

  const method = String(req?.method || '').toUpperCase();
  if (method !== 'POST' && method !== 'PATCH' && method !== 'PUT') return {};

  const chunks = [];
  try {
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } catch {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function json(res, status, data) {
  res.setHeader?.('Content-Type', 'application/json');
  res.setHeader?.('Cache-Control', 'no-store');
  res.statusCode = status;
  res.end(JSON.stringify(data ?? null));
}

export function allowMethods(req, res, ...methods) {
  const firstIsRequest = !!req && typeof req === 'object' && 'method' in req;
  const request = firstIsRequest ? req : req?.req;
  const response = firstIsRequest ? res : req;
  const method = String(request?.method || '').toUpperCase();
  const allowed = methods.map((m) => String(m).toUpperCase());

  if (allowed.includes(method)) return true;

  json(response, 405, {
    error: 'METHOD_NOT_ALLOWED',
    message: `Allowed methods: ${allowed.join(', ')}`,
  });
  return false;
}
