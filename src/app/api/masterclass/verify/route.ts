import { NextResponse, after } from "next/server";
import { z } from "zod";
import { verifyPaymentSignature } from "@/src/lib/razorpay";
import { sendMetaEvent, metaContextFromRequest } from "@/src/lib/meta-capi";
import { db } from "@/src/lib/db";
import { MASTERCLASS_EVENT } from "@/src/modules/masterclass/event";
import { deliverConfirmation, settleMasterclassPayment } from "@/src/modules/masterclass/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  registrationId: z.string().regex(/^[a-z0-9]{20,40}$/),
  razorpay_order_id: z.string().min(5).max(64),
  razorpay_payment_id: z.string().min(5).max(64),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
  fbEventId: z.string().max(80).regex(/^[A-Za-z0-9._-]+$/).optional(),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Checkout success callback. The signature proves Razorpay issued this payment
 * for this order; the order must also belong to the registration named. The
 * webhook settles the same payment independently, so a closed tab never loses
 * a paid registration.
 */
export async function POST(req: Request) {
  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (!parsed.success) return json({ error: "Invalid payment details." }, 400);
  const b = parsed.data;

  let valid = false;
  try {
    valid = verifyPaymentSignature({
      orderId: b.razorpay_order_id,
      paymentId: b.razorpay_payment_id,
      signature: b.razorpay_signature,
    });
  } catch (err) {
    console.error("[masterclass verify] cannot verify:", err);
    return json({ error: "Payments are not configured." }, 500);
  }
  if (!valid) return json({ error: "We couldn't verify this payment." }, 400);

  const reg = await db.masterclassRegistration.findUnique({
    where: { razorpay_order_id: b.razorpay_order_id },
    select: { id: true, full_name: true, email: true, phone: true, amount_paise: true },
  });
  if (!reg || reg.id !== b.registrationId) return json({ error: "This payment doesn't match your registration." }, 400);

  let settled;
  try {
    settled = await settleMasterclassPayment({ orderId: b.razorpay_order_id, paymentId: b.razorpay_payment_id });
  } catch (err) {
    console.error("[masterclass verify] settle failed:", err);
    // The webhook will still settle it; tell the student their payment is safe.
    return json({ ok: true, registrationId: reg.id, emailStatus: "PENDING", settling: true });
  }

  let emailStatus: string = "PENDING";
  try {
    emailStatus = await deliverConfirmation(reg.id);
  } catch (err) {
    console.error("[masterclass verify] confirmation email failed for", reg.id, err);
  }

  if (settled?.newlyPaid) {
    const ctx = metaContextFromRequest(req);
    const parts = reg.full_name.split(" ");
    after(async () => {
      await sendMetaEvent({
        eventName: "Purchase",
        eventId: b.fbEventId ?? `${reg.id}_purchase`,
        eventSourceUrl: ctx.eventSourceUrl,
        user: {
          email: reg.email,
          phone: reg.phone,
          firstName: parts[0],
          lastName: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
          fbp: ctx.fbp,
          fbc: ctx.fbc,
          clientIp: ctx.clientIp,
          userAgent: ctx.userAgent,
        },
        customData: {
          value: reg.amount_paise / 100,
          currency: "INR",
          content_name: MASTERCLASS_EVENT.title,
          event: MASTERCLASS_EVENT.key,
        },
      }).catch((err) => console.error("[masterclass] Meta CAPI failed:", err));
    });
  }

  return json({ ok: true, registrationId: reg.id, emailStatus });
}
