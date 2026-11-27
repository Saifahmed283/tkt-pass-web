import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL);

// A design is stored as jsonb but some drivers hand it back as text.
function parseDesign(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asIso(value) {
  return value instanceof Date ? value.toISOString() : value ?? null;
}

export function mapTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.holder_name ?? null,
    email: row.email ?? null,
    seat: row.seat ?? null,
    eventTitle: row.event_title ?? null,
    eventSubtitle: row.event_subtitle ?? null,
    location: row.location ?? null,
    eventDate: row.event_date ?? null,
    startsAt: asIso(row.starts_at),
    endsAt: asIso(row.ends_at),
    status: row.status ?? null,
    design: parseDesign(row.design),
    openedAt: asIso(row.opened_at),
    sentAt: asIso(row.sent_at),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

export async function getTicket(id) {
  const rows = await sql`select * from tickets where id = ${id} limit 1`;
  return mapTicket(rows[0]);
}

export async function listTickets() {
  const rows = await sql`select * from tickets order by created_at desc nulls last, id`;
  return rows.map(mapTicket);
}

// Successful sends in the current Cairo day. Used to enforce the Gmail daily cap.
export async function countSentToday() {
  const rows = await sql`
    select count(*)::int as n
    from send_log
    where status = 'ok'
      and created_at >= (date_trunc('day', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo')
  `;
  return rows[0]?.n ?? 0;
}

export async function upsertTicket(ticket) {
  // A missing design keeps the default on insert and preserves any existing
  // customization on update.
  const design = ticket?.design == null ? null : JSON.stringify(ticket.design);
  const rows = await sql`
    insert into tickets (
      id, holder_name, email, seat, event_title, event_subtitle,
      location, event_date, starts_at, ends_at, status, design
    ) values (
      ${ticket.id}, ${ticket.holder_name ?? ''}, ${ticket.email ?? ''}, ${ticket.seat ?? ''},
      ${ticket.event_title ?? null}, ${ticket.event_subtitle ?? null},
      ${ticket.location ?? null}, ${ticket.event_date ?? null},
      ${ticket.starts_at ?? null}, ${ticket.ends_at ?? null},
      ${ticket.status ?? 'issued'},
      coalesce(${design}::jsonb, '{"theme":"royal-gold","quote":""}'::jsonb)
    )
    on conflict (id) do update set
      holder_name = excluded.holder_name,
      email = excluded.email,
      seat = excluded.seat,
      event_title = excluded.event_title,
      event_subtitle = excluded.event_subtitle,
      location = excluded.location,
      event_date = excluded.event_date,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      status = excluded.status,
      design = coalesce(${design}::jsonb, tickets.design),
      updated_at = now()
    returning *
  `;
  return mapTicket(rows[0]);
}

export async function deleteTicket(id) {
  const rows = await sql`delete from tickets where id = ${id} returning id`;
  return rows.length > 0;
}

export async function saveDesign(id, design) {
  const rows = await sql`
    update tickets
       set design = ${JSON.stringify(design ?? null)}::jsonb,
           updated_at = now()
     where id = ${id}
    returning design, updated_at
  `;
  const row = rows[0];
  return {
    design: parseDesign(row?.design),
    updatedAt: asIso(row?.updated_at),
  };
}

export async function markOpened(id) {
  const rows = await sql`
    update tickets
       set opened_at = coalesce(opened_at, now()), updated_at = now()
     where id = ${id}
    returning opened_at
  `;
  return asIso(rows[0]?.opened_at);
}

export async function markSent(id) {
  const rows = await sql`
    update tickets
       set sent_at = coalesce(sent_at, now()), updated_at = now()
     where id = ${id}
    returning sent_at
  `;
  return asIso(rows[0]?.sent_at);
}

let sendLogReady;

async function ensureSendLogTable() {
  if (!sendLogReady) {
    sendLogReady = sql`
      create table if not exists send_log (
        id bigserial primary key,
        ticket_id text not null references tickets(id) on delete cascade,
        status text not null,
        provider_id text,
        error text,
        created_at timestamptz not null default now()
      )
    `;
  }
  try {
    await sendLogReady;
  } catch (error) {
    sendLogReady = null;
    throw error;
  }
}

export async function logSend(ticketId, status, providerId, error) {
  // Delivery logging must never turn a successful send into a failed request.
  try {
    await ensureSendLogTable();
    await sql`
      insert into send_log (ticket_id, status, provider_id, error)
      values (${ticketId ?? null}, ${status ?? null}, ${providerId ?? null}, ${error ?? null})
    `;
  } catch (logError) {
    console.error('logSend failed:', logError);
  }
}
