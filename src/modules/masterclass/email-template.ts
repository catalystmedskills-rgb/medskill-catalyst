import { MASTERCLASS_EVENT, SITE_URL } from "./event";

/**
 * Zoom confirmation email. Pure (no env, no I/O) so the rendered output is
 * unit-tested. Email-client-safe: table layout, inline styles, same brand
 * treatment as the existing Q&A confirmation (src/app/api/qa-register).
 */

export const MASTERCLASS_EMAIL_SUBJECT = "You're Registered! MedSkills Catalyst Masterclass — 24 October";

export type MasterclassEmailInput = {
  firstName: string;
  zoomUrl: string;
  /** e.g. "6:00 PM – 7:30 PM IST" */
  timeLabel: string;
  whatsappUrl?: string | null;
  meetingId?: string | null;
  passcode?: string | null;
  /** Present only for a verified ₹999 payment. */
  payment?: { amountPaise: number; paymentId: string } | null;
};

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function masterclassConfirmationEmail(input: MasterclassEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const name = escapeHtml(input.firstName);
  const zoom = escapeHtml(input.zoomUrl);
  const time = escapeHtml(input.timeLabel);
  const date = escapeHtml(MASTERCLASS_EVENT.dayDateLabel);
  const wa = input.whatsappUrl ? escapeHtml(input.whatsappUrl) : null;
  const session = escapeHtml(MASTERCLASS_EVENT.sessionTitle);

  const row = (label: string, value: string) =>
    `<tr><td style="font-size:15px;line-height:1.9;color:#0F1B27;"><strong>${label}:</strong> ${value}</td></tr>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="color-scheme" content="light only"><title>${escapeHtml(MASTERCLASS_EMAIL_SUBJECT)}</title></head>
<body style="margin:0;padding:0;background-color:#F1F3F4;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#F1F3F4;">You're registered for the MedSkills Catalyst Masterclass on ${date}, ${time}. Your Zoom joining link is inside.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F3F4;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #D9E0E6;font-family:'Plus Jakarta Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td align="center" style="background-color:#0A2A43;padding:32px 28px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" valign="middle" style="padding-right:12px;"><img src="${SITE_URL}/brand/logo/MedSkills-Catalyst_Logo.png" width="44" height="44" alt="MedSkills Catalyst" style="display:block;width:44px;height:44px;border-radius:50%;background-color:#FFFFFF;"></td>
<td align="left" valign="middle"><div style="font-family:Georgia,'Times New Roman',serif;color:#FFFFFF;font-size:24px;font-weight:700;">MedSkills Catalyst</div><div style="color:#4AD0FF;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;margin-top:4px;">Masterclass Registration</div></td>
</tr></table></td></tr>
<tr><td style="padding:36px 28px 8px 28px;">
<h1 style="margin:0 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;color:#0A2A43;font-weight:700;">You're Registered! &#127881;</h1>
<p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#3A4D60;">Hi <strong style="color:#0A2A43;">${name}</strong>,</p>
<p style="margin:0 0 12px 0;font-size:16px;line-height:1.6;color:#3A4D60;">Thank you for registering for the <strong style="color:#0A2A43;">MedSkills Catalyst Masterclass</strong>!</p>
<p style="margin:0;font-size:16px;line-height:1.6;color:#3A4D60;">We're excited to have you join us as we explore opportunities and career pathways in the MedTech industry.</p>
</td></tr>
<tr><td style="padding:18px 28px 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F7F9FB;border:1px solid #E3EAF0;border-radius:12px;"><tr><td style="padding:20px 22px;">
<div style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#00589E;margin-bottom:10px;">Masterclass Details</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0">${row("Session", session)}${row("Date", date)}${row("Time", time)}${row("Platform", "Zoom")}${
    input.payment
      ? row("Amount paid", `${escapeHtml(rupees(input.payment.amountPaise))} &middot; Payment ID ${escapeHtml(input.payment.paymentId)}`)
      : ""
  }</table>
</td></tr></table></td></tr>
<tr><td align="center" style="padding:26px 28px 6px 28px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#00589E" style="border-radius:100px;">
<a href="${zoom}" target="_blank" rel="noopener" style="display:inline-block;padding:15px 34px;font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:100px;">Join the Masterclass &rarr;</a>
</td></tr></table></td></tr>
${
  input.meetingId
    ? `<tr><td align="center" style="padding:10px 28px 0 28px;"><p style="margin:0;font-size:14px;line-height:1.8;color:#3A4D60;"><strong style="color:#0A2A43;">Meeting ID:</strong> ${escapeHtml(input.meetingId)}${input.passcode ? ` &nbsp;&middot;&nbsp; <strong style="color:#0A2A43;">Passcode:</strong> ${escapeHtml(input.passcode)}` : ""}</p></td></tr>`
    : ""
}
<tr><td align="center" style="padding:10px 28px 0 28px;"><p style="margin:0;font-size:12px;line-height:1.6;color:#6B7C8C;word-break:break-all;">Button not working? Copy this link into your browser:<br><a href="${zoom}" target="_blank" rel="noopener" style="color:#00589E;">${zoom}</a></p></td></tr>
<tr><td style="padding:22px 28px 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F7F9FB;border:1px solid #E3EAF0;border-left:3px solid #00589E;border-radius:10px;"><tr><td style="padding:14px 16px;font-size:14px;line-height:1.6;color:#3A4D60;">Please keep this email for easy access to the session. Joining <strong style="color:#0A2A43;">5&ndash;10 minutes early</strong> helps everything start on time.</td></tr></table></td></tr>
${
  wa
    ? `<tr><td style="padding:18px 28px 0 28px;"><p style="margin:0;font-size:14px;line-height:1.6;color:#3A4D60;">For reminders and announcements, join our <a href="${wa}" target="_blank" rel="noopener" style="color:#128C7E;font-weight:700;">WhatsApp community</a>.</p></td></tr>`
    : ""
}
<tr><td style="padding:24px 28px 36px 28px;"><p style="margin:0 0 4px 0;font-size:15px;line-height:1.6;color:#3A4D60;">We look forward to seeing you!</p><p style="margin:0;font-size:15px;line-height:1.6;color:#0A2A43;font-weight:700;">Team MedSkills Catalyst</p></td></tr>
<tr><td align="center" style="background-color:#0A2A43;padding:22px 28px;"><p style="margin:0;color:#96A1AA;font-size:12px;line-height:1.6;">&copy; 2026 MedSkills Catalyst Private Limited. All rights reserved.<br><a href="${SITE_URL}/" target="_blank" style="color:#4AD0FF;text-decoration:none;">medskillscatalyst.com</a></p><p style="margin:8px 0 0 0;color:#6E7C88;font-size:11px;line-height:1.5;">You're receiving this because you registered for the masterclass at medskillscatalyst.com.</p></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `Hi ${input.firstName},`,
    "",
    "Thank you for registering for the MedSkills Catalyst Masterclass!",
    "We're excited to have you join us as we explore opportunities and career pathways in the MedTech industry.",
    "",
    "Masterclass Details",
    `Session: ${MASTERCLASS_EVENT.sessionTitle}`,
    `Date: ${MASTERCLASS_EVENT.dayDateLabel}`,
    `Time: ${input.timeLabel}`,
    "Platform: Zoom",
    ...(input.payment ? [`Amount paid: ${rupees(input.payment.amountPaise)} · Payment ID ${input.payment.paymentId}`] : []),
    "",
    "Join the Masterclass:",
    input.zoomUrl,
    ...(input.meetingId ? [`Meeting ID: ${input.meetingId}${input.passcode ? ` · Passcode: ${input.passcode}` : ""}`] : []),
    "",
    "Please keep this email for easy access to the session.",
    ...(input.whatsappUrl ? ["", `WhatsApp community: ${input.whatsappUrl}`] : []),
    "",
    "We look forward to seeing you!",
    "Team MedSkills Catalyst",
    `${SITE_URL}/`,
  ].join("\n");

  return { subject: MASTERCLASS_EMAIL_SUBJECT, html, text };
}
