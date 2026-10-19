import "server-only";

/**
 * Transactional email via Resend — extracted from the qa-register handler so
 * it can be reused across flows. Sends never throw; callers get { ok } and
 * decide what to do (fulfillment treats a failed email as retryable).
 */

const FROM = "MedSkills Catalyst <info@medskillscatalyst.com>";

export type SendEmailResult = { ok: boolean; id?: string; reason?: string };

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text alternative; improves deliverability and accessibility. */
  text?: string;
  replyTo?: string;
  /**
   * Resend de-duplicates requests carrying the same key for 24 hours, so a
   * retry after an ambiguous failure (timeout after Resend accepted) cannot
   * deliver the same email twice.
   */
  idempotencyKey?: string;
  /** Abort the request after this long. Defaults to no client-side timeout. */
  timeoutMs?: number;
}): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY || process.env.Resend_Api_key;
  if (!key) return { ok: false, reason: "RESEND_API_KEY missing in this deployment's env" };

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: FROM,
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
      ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      console.error("[email] Resend send failed:", r.status, detail);
      return { ok: false, reason: `resend_${r.status}: ${detail}` };
    }
    const data = (await r.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (e) {
    const reason = "resend_exception: " + (e instanceof Error ? e.message : String(e));
    console.error("[email] Resend error:", e);
    return { ok: false, reason };
  }
}

const inr = (paise: number) =>
  (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

const rupee = (amount: number) =>
  Number(amount).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });

/**
 * Enrollment confirmation + GST invoice summary (option 1a: the invoice is
 * rendered inline as HTML in the email — no PDF dependency).
 */
export function enrollmentConfirmationEmail(data: {
  firstName: string;
  courseName: string;
  batchName: string;
  startDate: string | null;
  amountPaidPaise: number;
  paymentId: string;
  invoice: {
    invoice_no: string;
    issue_date?: string | null;
    subtotal: number | string;
    tax_amount: number | string;
    tax_rate: number | string;
    total: number | string;
    seller_gstin?: string | null;
    place_of_supply?: string | null;
    bill_name: string;
    items: Array<{ description: string; hsn?: string | null; quantity: number | string; rate: number | string; amount: number | string }>;
  } | null;
  whatsappUrl: string;
}): { subject: string; html: string } {
  const subject = `You're in! Enrollment confirmed — ${data.courseName}`;

  const itemsRows =
    data.invoice?.items
      .map(
        (it) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #eef1f4;font-size:13px;color:#1a2733;">
            ${escapeHtml(it.description)}${it.hsn ? `<br><span style="color:#7a8896;font-size:11px;">HSN/SAC ${escapeHtml(String(it.hsn))}</span>` : ""}
          </td>
          <td align="right" style="padding:8px 10px;border-bottom:1px solid #eef1f4;font-size:13px;color:#1a2733;">${rupee(Number(it.amount))}</td>
        </tr>`,
      )
      .join("") ?? "";

  const invoiceBlock = data.invoice
    ? `
    <table role="presentation" width="100%" style="border-collapse:collapse;margin-top:8px;background:#fff;border:1px solid #eef1f4;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:16px 18px;background:#0b2a4a;color:#fff;">
          <div style="font-size:13px;letter-spacing:.04em;text-transform:uppercase;opacity:.75;">Tax Invoice</div>
          <div style="font-size:18px;font-weight:700;margin-top:2px;">${escapeHtml(data.invoice.invoice_no)}</div>
          ${data.invoice.issue_date ? `<div style="font-size:12px;opacity:.75;margin-top:2px;">Issued ${escapeHtml(String(data.invoice.issue_date))}</div>` : ""}
        </td>
      </tr>
      <tr><td style="padding:14px 18px;">
        <div style="font-size:12px;color:#7a8896;">Billed to</div>
        <div style="font-size:14px;color:#1a2733;font-weight:600;">${escapeHtml(data.invoice.bill_name)}</div>
        ${data.invoice.place_of_supply ? `<div style="font-size:12px;color:#7a8896;margin-top:4px;">Place of supply: ${escapeHtml(data.invoice.place_of_supply)}</div>` : ""}
        ${data.invoice.seller_gstin ? `<div style="font-size:12px;color:#7a8896;">Seller GSTIN: ${escapeHtml(data.invoice.seller_gstin)}</div>` : ""}
      </td></tr>
      <tr><td style="padding:0 18px 8px;">
        <table role="presentation" width="100%" style="border-collapse:collapse;">
          <tr>
            <th align="left" style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#7a8896;border-bottom:2px solid #eef1f4;">Description</th>
            <th align="right" style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#7a8896;border-bottom:2px solid #eef1f4;">Amount</th>
          </tr>
          ${itemsRows}
          <tr>
            <td align="right" style="padding:8px 10px;font-size:13px;color:#7a8896;">Subtotal</td>
            <td align="right" style="padding:8px 10px;font-size:13px;color:#1a2733;">${rupee(Number(data.invoice.subtotal))}</td>
          </tr>
          <tr>
            <td align="right" style="padding:8px 10px;font-size:13px;color:#7a8896;">GST (${escapeHtml(String(data.invoice.tax_rate))}%)</td>
            <td align="right" style="padding:8px 10px;font-size:13px;color:#1a2733;">${rupee(Number(data.invoice.tax_amount))}</td>
          </tr>
          <tr>
            <td align="right" style="padding:10px;font-size:15px;font-weight:700;color:#0b2a4a;border-top:2px solid #eef1f4;">Total paid</td>
            <td align="right" style="padding:10px;font-size:15px;font-weight:700;color:#0b2a4a;border-top:2px solid #eef1f4;">${rupee(Number(data.invoice.total))}</td>
          </tr>
        </table>
      </td></tr>
    </table>`
    : `<p style="font-size:13px;color:#7a8896;">Your GST tax invoice will follow by email shortly.</p>`;

  const html = `
  <div style="background:#f4f6f8;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;border-collapse:collapse;">
      <tr><td style="padding:0 20px 16px;">
        <div style="font-size:20px;font-weight:800;color:#0b2a4a;">MedSkills Catalyst</div>
        <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a8896;">Upskill to Upscale</div>
      </td></tr>
      <tr><td style="background:#fff;border:1px solid #eef1f4;border-radius:16px;padding:26px 24px;">
        <div style="font-size:34px;">✅</div>
        <h1 style="font-size:22px;color:#0b2a4a;margin:10px 0 6px;">Payment received — you're confirmed!</h1>
        <p style="font-size:14px;line-height:1.6;color:#3a4a59;margin:0 0 14px;">
          Hi ${escapeHtml(data.firstName)}, your seat in <strong>${escapeHtml(data.courseName)}</strong>
          (${escapeHtml(data.batchName)}${data.startDate ? `, starting ${escapeHtml(data.startDate)}` : ""}) is officially confirmed.
        </p>
        <table role="presentation" width="100%" style="border-collapse:collapse;background:#f4f6f8;border-radius:12px;margin:0 0 16px;">
          <tr>
            <td style="padding:12px 14px;font-size:13px;color:#7a8896;">Amount paid</td>
            <td align="right" style="padding:12px 14px;font-size:15px;font-weight:700;color:#0b2a4a;">${inr(data.amountPaidPaise)}</td>
          </tr>
          <tr>
            <td style="padding:0 14px 12px;font-size:12px;color:#7a8896;">Razorpay payment ID</td>
            <td align="right" style="padding:0 14px 12px;font-size:12px;color:#3a4a59;font-family:monospace;">${escapeHtml(data.paymentId)}</td>
          </tr>
        </table>
        ${invoiceBlock}
        <p style="font-size:14px;line-height:1.6;color:#3a4a59;margin:18px 0 0;">
          We'll be in touch on WhatsApp with onboarding and pre-work details.
          Questions? <a href="${escapeHtml(data.whatsappUrl)}" style="color:#1f7a5a;font-weight:600;">Chat with us</a>.
        </p>
      </td></tr>
      <tr><td style="padding:16px 20px;text-align:center;color:#98a4b0;font-size:11px;">
        © MedSkills Catalyst · This is a system-generated confirmation for your enrollment payment.
      </td></tr>
    </table>
  </div>`;

  return { subject, html };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
