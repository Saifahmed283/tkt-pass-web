import nodemailer from 'nodemailer';

const APP_NAME = 'TKT-PASS';
let transporter;

function getTransporter() {
  if (!transporter) {
    const user = process.env.GMAIL_USER;
    const rawPassword = process.env.GMAIL_APP_PASSWORD || '';

    if (!user || !rawPassword) throw new Error('MISSING_GMAIL_CREDENTIALS');

    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user,
        // Gmail app passwords are displayed with spaces; Gmail accepts them without.
        pass: rawPassword.replace(/\s/g, ''),
      },
      pool: true,
      maxConnections: 1,
      maxMessages: 1,
    });
  }
  return transporter;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendTicketEmail({
  to,
  name,
  ticketId,
  seat,
  eventTitle,
  eventDate,
  token,
}) {
  if (!to || !token) throw new Error('MISSING_EMAIL_OR_TOKEN');

  const site = process.env.SITE_URL || 'https://tkt-pass.vercel.app';
  const link = `${site.replace(/\/$/, '')}/pass?t=${encodeURIComponent(token)}`;
  const title = eventTitle || 'Wadi Degla Escape';
  const date = eventDate || 'Friday, 4 December at 08:34 PM';
  const holder = name || 'Guest';
  const subject = `Your ${APP_NAME} pass — ${title}`;

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#0f1115;font-family:Arial,'Segoe UI',sans-serif;color:#f7f7f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1115;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:linear-gradient(160deg,#1c2230,#12151c);border:1px solid #2b3342;border-radius:20px;padding:36px 32px;">
          <tr><td align="center" style="font-size:22px;font-weight:700;letter-spacing:4px;color:#e9c46a;">${APP_NAME}</td></tr>
          <tr><td align="center" style="padding-top:18px;font-size:20px;font-weight:700;">مرحبًا ${escapeHtml(holder)} 👋</td></tr>
          <tr><td align="center" style="padding-top:8px;font-size:15px;line-height:1.7;color:#c8cdd6;">تم تجهيز تذكرتك لـ ${escapeHtml(title)}. اضغط على الزر أدناه لعرض تذكرتك وتخصيصها.</td></tr>
          <tr><td align="center" style="padding-top:8px;font-size:14px;line-height:1.7;color:#c8cdd6;">Hi ${escapeHtml(holder)}, your ${APP_NAME} pass for ${escapeHtml(title)} is ready. Tap the button below to open and personalize your pass.</td></tr>
          <tr><td style="padding-top:16px;font-size:14px;color:#e9c46a;">📅 ${escapeHtml(date)} &nbsp;·&nbsp; 🎟️ Seat ${escapeHtml(seat)}</td></tr>
          <tr><td align="center" style="padding-top:28px;">
            <a href="${escapeHtml(link)}" style="display:inline-block;background:#e9c46a;color:#141414;text-decoration:none;font-weight:700;padding:14px 30px;border-radius:999px;">Open my pass / افتح تذكرتي</a>
          </td></tr>
          <tr><td align="center" style="padding-top:24px;font-size:12px;color:#7d8798;word-break:break-all;">Ticket ${escapeHtml(ticketId)} · This link is personal, please do not share it.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    `مرحبًا ${holder} 👋`,
    `تم تجهيز تذكرتك لـ ${title}. افتح الرابط أدناه لعرض تذكرتك وتخصيصها.`,
    `الموعد: ${date} · المقعد: ${seat}`,
    '',
    `Hi ${holder},`,
    `Your ${APP_NAME} pass for ${title} is ready. Open the link below to view and personalize it.`,
    `When: ${date} · Seat: ${seat}`,
    '',
    link,
    '',
    `Ticket ${ticketId} · This link is personal, please do not share it.`,
  ].join('\n');

  const info = await getTransporter().sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
    text,
  });

  if (!info?.messageId) throw new Error('EMAIL_PROVIDER_ERROR');
  return info.messageId;
}

export function closeTransporter() {
  if (transporter) {
    transporter.close();
    transporter = undefined;
  }
}
