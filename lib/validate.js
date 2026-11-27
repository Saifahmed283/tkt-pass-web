export const THEMES = [
  'royal-gold',
  'rose-blush',
  'lilac-dream',
  'emerald-wild',
  'midnight-sky',
];

const HEX = /^#[0-9a-f]{6}$/i;
const CONTROL = /[\u0000-\u001f\u007f]/g;

const DEFAULTS = {
  eventTitle: 'Wadi Degla Escape',
  eventSubtitle: 'مغامرة محمية وادي دجلة · An Extraordinary Day',
  location: 'Wadi Degla Protectorate · المعادي',
  eventDate: 'Friday, 4 December at 08:34 PM',
};

export function normalizeHex(value, fallback = null) {
  if (typeof value !== 'string') return fallback ?? null;
  const trimmed = value.trim();
  return HEX.test(trimmed) ? trimmed.toLowerCase() : fallback ?? null;
}

export function validateDesign(input) {
  if (input == null) {
    return { theme: 'royal-gold', header: null, accent: null, quote: '' };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('INVALID_DESIGN');
  }

  for (const key of ['theme', 'header', 'accent', 'quote', 'graphic']) {
    if (input[key] != null && typeof input[key] !== 'string') {
      throw new Error('INVALID_DESIGN');
    }
  }

  const theme = THEMES.includes(input.theme) ? input.theme : 'royal-gold';
  const quote = String(input.quote ?? '')
    .replace(CONTROL, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);

  return {
    theme,
    header: normalizeHex(input.header, null),
    accent: normalizeHex(input.accent, null),
    quote,
    graphic: ['none', 'topographic', 'contours', 'grid', 'orbit', 'diagonal'].includes(input.graphic) ? input.graphic : 'none',
  };
}

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalDate(value) {
  const text = str(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : text;
}

export function validateTicket(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('INVALID_TICKET');
  }

  const id = str(input.id ?? input.ticket_id ?? input.ticketId);
  const holderName = str(input.holder_name ?? input.name);
  const email = str(input.email).toLowerCase();
  const seat = str(input.seat);

  if (!id || !holderName || !email || !seat) {
    throw new Error('MISSING_REQUIRED_FIELDS');
  }

  let design = null;
  if (input.design != null) design = validateDesign(input.design);

  return {
    id,
    holder_name: holderName,
    email,
    seat,
    event_title: str(input.event_title ?? input.eventTitle) || DEFAULTS.eventTitle,
    event_subtitle: str(input.event_subtitle ?? input.eventSubtitle) || DEFAULTS.eventSubtitle,
    location: str(input.location) || DEFAULTS.location,
    event_date: str(input.event_date ?? input.eventDate) || DEFAULTS.eventDate,
    starts_at: optionalDate(input.starts_at ?? input.startsAt),
    ends_at: optionalDate(input.ends_at ?? input.endsAt),
    status: str(input.status) || 'issued',
    design,
    opened_at: optionalDate(input.opened_at ?? input.openedAt),
    sent_at: optionalDate(input.sent_at ?? input.sentAt),
  };
}
