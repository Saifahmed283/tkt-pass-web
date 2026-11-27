// Local smoke test for the core backend helpers.
// Usage: node scripts/smoke.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envFile = path.join(root, '.env.local')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const { signTicketToken, verifyTicketToken, signAdminSession, verifyAdminSession } = await import('../lib/jwt.js')
const { validateDesign, validateTicket } = await import('../lib/validate.js')
const { getTicket, listTickets, saveDesign } = await import('../lib/db.js')

const token = await signTicketToken({ ticketId: 'TKT-26001', endsAt: '2026-12-05T17:00:00+02:00' })
const payload = await verifyTicketToken(token)
if (!payload || payload.tid !== 'TKT-26001') throw new Error('Ticket token verification failed')

const admin = await signAdminSession()
if (!(await verifyAdminSession(admin))) throw new Error('Admin session verification failed')

const design = validateDesign({ theme: 'emerald-wild', header: '#10261F', accent: '#6EE7B7', quote: 'testing ✨' })
if (design.theme !== 'emerald-wild') throw new Error('Design validation failed')

const ticket = validateTicket({ id: 'TKT-TEST', name: 'Test User', email: 'TEST@Example.COM', seat: 'A1' })
if (ticket.email !== 'test@example.com') throw new Error('Ticket validation failed')

const dbTicket = await getTicket('TKT-26001')
if (!dbTicket || dbTicket.name !== 'Omar Khaled') throw new Error('Database read failed')

const all = await listTickets()
if (all.length < 3) throw new Error('Expected at least 3 seeded tickets')

console.log('SMOKE_OK', {
  tokenClaims: { tid: payload.tid, exp: new Date(payload.exp * 1000).toISOString() },
  design,
  ticket,
  dbTicket: { id: dbTicket.id, name: dbTicket.name, seat: dbTicket.seat },
  ticketCount: all.length
})
