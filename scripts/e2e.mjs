// End-to-end API test against scripts/local-server.mjs (no email sending).
// Usage: node scripts/local-server.mjs   then in another terminal: node scripts/e2e.mjs
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ADMIN_PASSWORD = process.env.ADMIN_SECRET || 'b19ac780de416c67b09cfc81'

async function call(path, options = {}, cookie = '') {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) }
  })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, body, setCookie: res.headers.get('set-cookie') }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// 1. Admin auth
let r = await call('/api/admin/auth', { method: 'POST', body: JSON.stringify({ password: 'wrong-password' }) })
assert(r.status === 401, 'Wrong admin password should be rejected')

r = await call('/api/admin/auth', { method: 'POST', body: JSON.stringify({ password: ADMIN_PASSWORD }) })
assert(r.status === 200 && r.body.ok, 'Admin login failed')
const cookie = (r.setCookie || '').split(';')[0]

// 2. Stats + tickets
r = await call('/api/admin/stats', {}, cookie)
assert(r.status === 200 && typeof r.body.total === 'number', 'Stats failed')

r = await call('/api/admin/tickets', {}, cookie)
assert(r.status === 200 && r.body.tickets.length >= 3, 'Ticket list failed')

// 3. Short-lived preview token → guest pass load
r = await call('/api/admin/preview?id=TKT-26001', {}, cookie)
assert(r.status === 200 && r.body.token, 'Preview token failed')
const token = r.body.token

r = await call('/api/pass?t=' + encodeURIComponent(token))
assert(r.status === 200 && r.body.ticket.name === 'Omar Khaled', 'Guest pass load failed')

r = await call('/api/pass?t=' + encodeURIComponent(token + 'tampered'))
assert(r.status === 401, 'Tampered token should be rejected')

// 4. Save design
const quote = 'E2E test quote ✨'
r = await call('/api/pass/design', {
  method: 'POST',
  body: JSON.stringify({ t: token, design: { theme: 'emerald-wild', header: '#10261F', accent: '#6EE7B7', quote } })
})
assert(r.status === 200 && r.body.ok, 'Design save failed')

r = await call('/api/pass?t=' + encodeURIComponent(token))
assert(r.body.design.quote === quote, 'Saved design was not returned')

// 5. CSV import
r = await call('/api/admin/import', {
  method: 'POST',
  body: JSON.stringify({ csv: 'ticket_id,holder_name,email,seat\nTKT-99999,CSV Tester,csv@example.com,Seat Z9' })
}, cookie)
assert(r.status === 200 && r.body.imported === 1, 'CSV import failed')

// 6. Unauthorized admin access
r = await call('/api/admin/tickets')
assert(r.status === 401, 'Admin endpoint without cookie should be unauthorized')

console.log('E2E_OK', { stats: r.status, tokenPrefix: token.slice(0, 12) })
