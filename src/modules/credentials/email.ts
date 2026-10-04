import { ISSUER_NAME } from "./config";
import { formatLongDate } from "./dates";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * Learner credential email. Every interpolated value is HTML-escaped; URLs are
 * built by the server from config + the verification token, never from input.
 */
export function credentialEmail(d: {
  learnerName: string;
  programName: string;
  certificateId: string;
  completionDate: Date;
  verifyUrl: string;
  downloadUrl: string;
  isResend: boolean;
  /** INTERNSHIP_COMPLETION credentials: what the internship was, and when. */
  internship?: { title: string; startDate: Date; endDate: Date; duration: string } | null;
}): { subject: string; html: string; text: string } {
  const what = d.internship
    ? `your internship, <strong>${esc(d.internship.title)}</strong> (${esc(d.programName)}), from ${esc(formatLongDate(d.internship.startDate))} to ${esc(formatLongDate(d.internship.endDate))} (${esc(d.internship.duration)})`
    : `<strong>${esc(d.programName)}</strong>, completed on ${esc(formatLongDate(d.completionDate))}`;
  const headline = d.internship ? "Congratulations on completing your internship" : "Congratulations on completing your program";
  const first = d.learnerName.split(" ")[0] || d.learnerName;
  const subject = d.isResend
    ? `Your ${ISSUER_NAME} certificate: ${d.programName}`
    : `Congratulations! Your ${ISSUER_NAME} certificate: ${d.programName}`;

  const html = `<!doctype html>
<html><body style="margin:0;background:#F7F9FB;font-family:'Plus Jakarta Sans',Inter,-apple-system,'Segoe UI',Arial,sans-serif;color:#0F1B27">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FB;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid rgba(10,42,67,0.08)">
<tr><td style="background:#0A2A43;padding:22px 28px;color:#FFFFFF;font-size:13px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase">${esc(ISSUER_NAME)}</td></tr>
<tr><td style="padding:32px 28px 8px">
<p style="margin:0 0 6px;font-size:15px">Dear ${esc(first)},</p>
<h1 style="margin:0 0 16px;font-family:Fraunces,Georgia,serif;font-weight:600;font-size:26px;line-height:1.2;color:#0A2A43">${d.isResend ? "Here is your certificate" : headline}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.7">${d.isResend ? "As requested, here is" : "We are delighted to confirm"} your ${esc(ISSUER_NAME)} credential for ${what}.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#E8F2FB;border-radius:12px;width:100%"><tr><td style="padding:14px 16px;font-size:13px;color:#5A6B7B">Certificate ID<br><span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:16px;color:#0A2A43;font-weight:700;letter-spacing:0.04em">${esc(d.certificateId)}</span></td></tr></table>
<p style="margin:0 0 12px"><a href="${esc(d.verifyUrl)}" style="display:inline-block;background:#00589E;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:100px">View credential</a></p>
<p style="margin:0 0 24px;font-size:14px"><a href="${esc(d.downloadUrl)}" style="color:#00589E">Download your certificate (PDF)</a></p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.7;color:#5A6B7B">Anyone can confirm this credential is genuine by scanning the QR code on the certificate or entering the certificate ID at the link above. You can share that link with employers.</p>
</td></tr>
<tr><td style="padding:16px 28px 28px;font-size:12px;color:#5A6B7B;border-top:1px solid rgba(10,42,67,0.08)">${esc(ISSUER_NAME)} · Upskill to Upscale</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `Dear ${first},`,
    "",
    `${d.isResend ? "Here is" : "Congratulations! Here is"} your ${ISSUER_NAME} credential for ${
      d.internship
        ? `your internship, ${d.internship.title} (${d.programName}), from ${formatLongDate(d.internship.startDate)} to ${formatLongDate(d.internship.endDate)} (${d.internship.duration})`
        : `${d.programName}, completed on ${formatLongDate(d.completionDate)}`
    }.`,
    "",
    `Certificate ID: ${d.certificateId}`,
    `View credential: ${d.verifyUrl}`,
    `Download certificate: ${d.downloadUrl}`,
    "",
    ISSUER_NAME,
  ].join("\n");

  return { subject, html, text };
}
