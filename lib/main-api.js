// Server-side BFF client for the main TKT API. Browser code never sees the
// service token or the backend URL beyond this app's own /api routes.

// Backend routes are registered at the domain root; `/api` is only the
// frontend's proxy path, not part of the backend's own route table.
const DEFAULT_API_BASE = 'https://tkt-backend.vercel.app';

function apiBase() {
  return (process.env.TKT_API_BASE || DEFAULT_API_BASE).replace(/\/$/, '');
}

function messageOf(payload, status) {
  if (payload?.error && typeof payload.error === 'object') {
    return payload.error.message || payload.error.code || `TKT API error (${status})`;
  }
  if (typeof payload?.error === 'string') return payload.error;
  if (typeof payload?.message === 'string') return payload.message;
  return `TKT API error (${status})`;
}

export function serviceHeaders(actor) {
  const token = process.env.TKT_SERVICE_TOKEN;
  if (!token) throw new Error('MISSING_TKT_SERVICE_TOKEN');

  const headers = {
    'Content-Type': 'application/json',
    'X-TKT-Service-Token': token,
  };

  if (actor && !actor.master) {
    if (actor.userId) headers['X-TKT-Actor-User-Id'] = actor.userId;
    if (actor.platformRole) headers['X-TKT-Actor-Platform-Role'] = actor.platformRole;
    if (actor.orgRole) headers['X-TKT-Actor-Org-Role'] = actor.orgRole;
    headers['X-TKT-Actor-Role'] = 'user';
  } else {
    headers['X-TKT-Actor-Role'] = 'master';
  }

  return headers;
}

export async function mainApi(path, options = {}) {
  const { method = 'GET', body, actor, service = false, headers: extraHeaders = {} } = options;
  const url = `${apiBase()}${path.startsWith('/') ? path : `/${path}`}`;

  const headers = service
    ? serviceHeaders(actor)
    : { 'Content-Type': 'application/json', ...extraHeaders };

  const response = await fetch(url, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(messageOf(payload, response.status));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function mainServiceApi(path, options = {}) {
  return mainApi(path, { ...options, service: true });
}
