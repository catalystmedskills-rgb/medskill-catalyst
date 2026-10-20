import { NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { verifyWebhookSignature } from "@/src/lib/razorpay";
import { settleCapturedPayment, markPaymentFailed } from "@/src/modules/enroll/service";
import {
  deliverConfirmation,
  markMasterclassPaymentFailed,
  settleMasterclassPayment,
} from "@/src/modules/masterclass/service";

export const runtime = "nodejs";
// The raw request body is required for signature verification — do not let a
// framework parse it first.
export const dynamic = "force-dynamic";

const PROVIDER = "razorpay";

type RzpPaymentEntity = {
  id: string;
  order_id: string;
  status: string;
  method?: string;
};

/**
 * Razorpay webhook — the AUTHORITATIVE source of payment truth.
 *
 * Flow: verify X-Razorpay-Signature over the raw body → dedupe by the
 * x-razorpay-event-id header (WebhookEvent unique key) → on payment.captured /
 * order.paid, record the capture and run idempotent fulfillment. Duplicate
 * deliveries do nothing; a fulfillment that isn't fully done returns non-200 so
 * Razorpay retries (fulfillment is safe to repeat).
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  const eventId = req.headers.get("x-razorpay-event-id");

  // 1) Verify authenticity.
  let valid = false;
  try {
    valid = verifyWebhookSignature(raw, signature);
  } catch (err) {
    console.error("[rzp webhook] cannot verify (secret not configured?)", err);
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: {
      payment?: { entity?: RzpPaymentEntity };
      order?: { entity?: { id?: string } };
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const type = event.event ?? "unknown";
  const dedupeKey = eventId || `${type}:${event.payload?.payment?.entity?.id ?? raw.length}`;

  // 2) Dedupe. Insert the event first; a duplicate delivery that was already
  //    fully processed short-circuits here.
  try {
    await db.webhookEvent.create({
      data: { provider: PROVIDER, event_id: dedupeKey, type, payload: event as object },
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") {
      const existing = await db.webhookEvent.findUnique({
        where: { provider_event_id: { provider: PROVIDER, event_id: dedupeKey } },
      });
      if (existing?.processed_at) {
        return NextResponse.json({ ok: true, deduped: true });
      }
      // Seen but not finished — fall through and retry processing.
    } else {
      console.error("[rzp webhook] event store error", err);
      return NextResponse.json({ error: "Store error." }, { status: 500 });
    }
  }

  const markProcessed = async () => {
    await db.webhookEvent.updateMany({
      where: { provider: PROVIDER, event_id: dedupeKey },
      data: { processed_at: new Date() },
    });
  };

  // 3) Handle the events we care about.
  try {
    const payment = event.payload?.payment?.entity;

    if ((type === "payment.captured" || type === "order.paid") && payment?.order_id && payment.id) {
      // Masterclass orders are settled by their own module; everything else is
      // an enrollment payment and continues below unchanged.
      const masterclass = await settleMasterclassPayment({ orderId: payment.order_id, paymentId: payment.id });
      if (masterclass) {
        // The payment is recorded. If the email fails here the retry sweep and
        // cron resend it, so the webhook itself does not need redelivery.
        await deliverConfirmation(masterclass.id).catch((err) =>
          console.error("[rzp webhook] masterclass email failed, sweep will retry", masterclass.id, err),
        );
        await markProcessed();
        return NextResponse.json({ ok: true });
      }

      const result = await settleCapturedPayment({
        orderId: payment.order_id,
        paymentId: payment.id,
        method: payment.method ?? null,
        raw: payment,
      });

      if (result.invoiceOk && result.emailOk) {
        await markProcessed();
        return NextResponse.json({ ok: true });
      }
      // Payment + confirmation are safe; invoice/email still settling. Ask
      // Razorpay to redeliver so the remaining step(s) retry.
      console.warn("[rzp webhook] fulfillment incomplete, will retry", {
        enrollment: result.enrollmentId,
        invoiceOk: result.invoiceOk,
        emailOk: result.emailOk,
      });
      return NextResponse.json({ ok: false, retry: true }, { status: 500 });
    }

    if (type === "payment.failed" && payment?.order_id) {
      if (!(await markMasterclassPaymentFailed(payment.order_id))) {
        await markPaymentFailed(payment.order_id, payment.status);
      }
    }

    // Unhandled or terminal event — acknowledge so it isn't retried.
    await markProcessed();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[rzp webhook] processing error", err);
    // Leave processed_at null so Razorpay retries.
    return NextResponse.json({ error: "Processing error." }, { status: 500 });
  }
}
