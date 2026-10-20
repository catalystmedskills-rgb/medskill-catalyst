import { NextResponse, after } from "next/server";
import { z } from "zod";
import { clientKey, consumeRequestAllowance } from "@/src/lib/rate-limit";
import { sendMetaEvent, metaContextFromRequest } from "@/src/lib/meta-capi";
import { registrationRequestSchema } from "@/src/modules/masterclass/schema";
import {
  readMasterclassConfig,
  masterclassReadiness,
  pricingAt,
  holdEnabled,
  paidRegistrationAvailable,
} from "@/src/modules/masterclass/config";
import { HOLD_COOKIE, cookieFromHeader, readHoldValue } from "@/src/modules/masterclass/hold";
import { MASTERCLASS_EVENT } from "@/src/modules/masterclass/event";
import {
  registerForMasterclass,
  deliverConfirmation,
  processDueConfirmations,
  createMasterclassOrder,
} from "@/src/modules/masterclass/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per-client submissions allowed per window. Generous for shared campus Wi-Fi. */
const RATE_LIMIT = { limit: 8, windowSeconds: 10 * 60 };
const MAX_BODY_BYTES = 8 * 1024;
/** Faster than this from first render to submit is treated as a bot. */
const MIN_HUMAN_MS = 1200;

function json(body: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Reject cross-site posts. Browsers always send Origin on a fetch POST. */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients; still rate limited and validated
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Invalid request origin." }, 403);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return json({ error: "Request too large." }, 413);
  }

  const config = readMasterclassConfig();
  const readiness = masterclassReadiness(config);
  if (!readiness.open) {
    console.warn("[masterclass] registration refused, not configured:", readiness.missing.join("; "));
    return json({ error: "Registrations for this masterclass are not open yet. Please check back soon." }, 503);
  }

  // Price is decided here, on the server clock and the signed hold cookie,
  // never by the page's countdown. No valid hold cookie (blocked cookies, or a
  // first request straight to the API) counts as a hold starting now.
  const now = new Date();
  const holdStart = holdEnabled(config)
    ? (readHoldValue(cookieFromHeader(req.headers.get("cookie"), HOLD_COOKIE), config.holdSecret!, now) ?? now)
    : null;
  const pricing = pricingAt(config, now, holdStart);
  if (pricing.phase === "closed") {
    return json({ error: "Registration has closed — the masterclass has already started." }, 410);
  }

  const verdict = await consumeRequestAllowance(clientKey(req.headers, "masterclass-register"), RATE_LIMIT);
  if (verdict.blocked) {
    return json(
      { error: "Too many attempts from this connection. Please wait a few minutes and try again." },
      429,
      { "Retry-After": String(verdict.retryAfterSeconds) },
    );
  }

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: "Request too large." }, 413);
    raw = JSON.parse(text);
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const parsed = registrationRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return json({ error: "Please check the highlighted fields.", fieldErrors }, 422);
  }
  const input = parsed.data;

  // Bots fill the hidden field or submit instantly. Answer like a success so
  // they learn nothing, but store nothing and send nothing.
  if (input.website || (input.elapsedMs !== undefined && input.elapsedMs < MIN_HUMAN_MS)) {
    console.warn("[masterclass] dropped a submission flagged as automated");
    return json({ ok: true, registrationId: null, duplicate: false, emailStatus: "PENDING" });
  }

  let outcome;
  try {
    outcome = await registerForMasterclass(input, pricing);
  } catch (err) {
    console.error("[masterclass] registration save failed:", err);
    return json(
      { error: "We couldn't save your registration just now. Please try again in a moment." },
      500,
    );
  }

  // Saved but unpaid: hand back a Razorpay order. The Zoom email waits for a
  // verified payment (see /api/masterclass/verify and the Razorpay webhook).
  if (outcome.paymentStatus === "PENDING" || outcome.paymentStatus === "FAILED") {
    // Payments can't be taken yet: keep the details, but don't pretend.
    if (!paidRegistrationAvailable(config)) {
      return json(
        {
          error:
            "Registration is paused right now. Your details are saved and we'll contact you as soon as registration reopens.",
          paused: true,
        },
        503,
      );
    }
    try {
      const order = await createMasterclassOrder(outcome.id);
      return json({
        ok: true,
        requiresPayment: true,
        registrationId: outcome.id,
        duplicate: outcome.kind === "duplicate",
        order: { id: order.orderId, amount: order.amountPaise, currency: "INR", keyId: order.keyId },
        prefill: { name: input.fullName, email: input.email, contact: input.phone },
      });
    } catch (err) {
      console.error("[masterclass] order creation failed for", outcome.id, err);
      return json(
        { error: "Your details are saved, but we couldn't start the payment. Please try again in a moment." },
        502,
      );
    }
  }

  // The registration is saved; from here on nothing can turn it into a failure.
  let emailStatus = outcome.emailStatus;
  try {
    if (outcome.kind === "created") {
      emailStatus = await deliverConfirmation(outcome.id, { config });
    } else if (emailStatus !== "SENT") {
      // A student re-submitting usually means "I never got the email".
      emailStatus = await deliverConfirmation(outcome.id, { config, force: true });
    }
  } catch (err) {
    console.error("[masterclass] confirmation email step failed for", outcome.id, err);
  }

  if (outcome.kind === "created") {
    const ctx = metaContextFromRequest(req);
    const parts = input.fullName.split(" ");
    after(async () => {
      await sendMetaEvent({
        eventName: "CompleteRegistration",
        eventId: input.fbEventId ?? outcome.id,
        eventSourceUrl: input.attribution?.landing_page || ctx.eventSourceUrl,
        user: {
          email: input.email,
          phone: input.phone,
          firstName: parts[0],
          lastName: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
          fbp: ctx.fbp,
          fbc: ctx.fbc,
          clientIp: ctx.clientIp,
          userAgent: ctx.userAgent,
        },
        customData: { content_name: MASTERCLASS_EVENT.title, event: MASTERCLASS_EVENT.key },
      }).catch((err) => console.error("[masterclass] Meta CAPI failed:", err));
    });
  }

  // Each registration also nudges any earlier emails that are due for a retry.
  after(async () => {
    await processDueConfirmations(10).catch((err) =>
      console.error("[masterclass] retry sweep failed:", err),
    );
  });

  return json({
    ok: true,
    registrationId: outcome.id,
    duplicate: outcome.kind === "duplicate",
    emailStatus,
  });
}
