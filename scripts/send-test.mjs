// Sends one real TKT-PASS email to the configured Gmail address itself.
// Usage: npm run test:send
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

if (!process.env.GMAIL_USER) throw new Error('GMAIL_USER is not configured')

const { getTicket } = await import('../lib/db.js')
const { signTicketToken } = await import('../lib/jwt.js')
const { sendTicketEmail, closeTransporter } = await import('../lib/mail.js')

const ticket = await getTicket('TKT-26001')
if (!ticket) throw new Error('Demo ticket TKT-26001 was not found')

const token = await signTicketToken({ ticketId: ticket.id, endsAt: ticket.endsAt })
const messageId = await sendTicketEmail({
  to: process.env.GMAIL_USER,
  name: 'TKT-PASS Self Test',
  ticketId: 'SELF-TEST',
  seat: 'Inbox check',
  eventTitle: 'TKT-PASS email test',
  eventDate: 'Now',
  token,
})

closeTransporter()
console.log('SEND_TEST_OK', { to: process.env.GMAIL_USER, messageId })
