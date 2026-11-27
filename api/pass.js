import { allowMethods, json } from '../lib/http.js';
import { decodeTicketToken, verifyTicketToken } from '../lib/jwt.js';
import { getTicket, markOpened } from '../lib/db.js';
import { validateDesign } from '../lib/validate.js';

function queryValue(req, key) {
  const fromQuery = req?.query?.[key];
  if (typeof fromQuery === 'string') return fromQuery;
  if (Array.isArray(fromQuery) && typeof fromQuery[0] === 'string') return fromQuery[0];
  try {
    return new URL(req?.url || '/', 'https://localhost').searchParams.get(key);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    if (!allowMethods(req, res, 'GET')) return;

    const token = queryValue(req, 't');
    if (!token) return json(res, 400, { error: 'INVALID_LINK' });

    const payload = await verifyTicketToken(token);
    if (!payload) {
      const decoded = decodeTicketToken(token);
      const expired = decoded && typeof decoded.exp === 'number' && decoded.exp < Date.now() / 1000;
      return json(res, expired ? 410 : 401, {
        error: expired ? 'EXPIRED_LINK' : 'INVALID_LINK',
      });
    }

    const ticket = await getTicket(payload.tid);
    if (!ticket) return json(res, 404, { error: 'NOT_FOUND' });

    try {
      await markOpened(ticket.id);
    } catch (error) {
      console.error('markOpened failed:', error);
    }

    return json(res, 200, {
      ticket: {
        id: ticket.id,
        name: ticket.name,
        seat: ticket.seat,
        eventTitle: ticket.eventTitle,
        eventSubtitle: ticket.eventSubtitle,
        location: ticket.location,
        eventDate: ticket.eventDate,
        startsAt: ticket.startsAt,
        endsAt: ticket.endsAt,
      },
      design: validateDesign(ticket.design),
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'SERVER_ERROR' });
  }
}
