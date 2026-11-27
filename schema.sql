-- TKT digital pass — Neon Postgres schema
-- Run once in the Neon SQL editor or with: psql "$DATABASE_URL" -f schema.sql

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  holder_name TEXT NOT NULL,
  email TEXT NOT NULL,
  seat TEXT NOT NULL,
  event_title TEXT NOT NULL DEFAULT 'Wadi Degla Escape',
  event_subtitle TEXT NOT NULL DEFAULT 'مغامرة محمية وادي دجلة · An Extraordinary Day',
  location TEXT NOT NULL DEFAULT 'Wadi Degla Protectorate · المعادي',
  event_date TEXT NOT NULL DEFAULT 'Saturday, Dec 5 · 07:00 AM',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'sent', 'opened', 'checked_in')),
  design JSONB NOT NULL DEFAULT '{"theme":"royal-gold","quote":""}'::jsonb,
  opened_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS send_log (
  id BIGSERIAL PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  provider_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_email ON tickets(email);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_send_log_ticket ON send_log(ticket_id);

-- Demo data for local testing
INSERT INTO tickets (id, holder_name, email, seat, event_title, event_date, starts_at, ends_at, status, design) VALUES
('TKT-26001', 'Omar Khaled', 'omar@example.com', 'Bus 01 · Seat A4', 'Wadi Degla Escape', 'Saturday, Dec 5 · 07:00 AM', '2026-12-05T07:00:00+02:00', '2026-12-05T17:00:00+02:00', 'sent', '{"theme":"royal-gold","quote":"أحلى لمة ومغامرة في وادي دجلة ✨"}'::jsonb),
('TKT-26002', 'Salma Ahmed', 'salma@example.com', 'Bus 02 · Seat B7', 'Wadi Degla Escape', 'Saturday, Dec 5 · 07:00 AM', '2026-12-05T07:00:00+02:00', '2026-12-05T17:00:00+02:00', 'issued', '{"theme":"rose-blush","quote":"يوم من أيامنا الحلوة 🌸"}'::jsonb),
('TKT-26003', 'Mostafa Ali', 'mostafa@example.com', 'Bus 01 · Seat C2', 'Wadi Degla Escape', 'Saturday, Dec 5 · 07:00 AM', '2026-12-05T07:00:00+02:00', '2026-12-05T17:00:00+02:00', 'sent', '{"theme":"emerald-wild","quote":"غابة وذكريات 🌿"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
