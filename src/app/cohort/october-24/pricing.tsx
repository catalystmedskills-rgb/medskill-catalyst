"use client";

import { useEffect, useState } from "react";
import { MASTERCLASS_EVENT } from "@/src/modules/masterclass/event";

/**
 * Offer pricing and countdown. The server decides the price on submit; this
 * component only displays it. Three modes, in order of precedence:
 *   - a server-enforced limit (festive deadline MASTERCLASS_FREE_UNTIL and/or a
 *     personal hold kept in a signed cookie) when either is configured, or
 *   - otherwise a display-only countdown of `displayTimerMinutes` that starts
 *     on each visit and restarts at zero; registration stays free throughout.
 *     (Chosen by the owner on 2026-10-22 so returning visitors can always
 *     register while payments are unavailable.)
 */

export type OfferPhase = "free" | "paid";

export type PricingProps = {
  /** Phase as computed on the server when the page rendered. */
  initialPhase: OfferPhase;
  /** ISO instant the festive offer ends, or null when there is no deadline. */
  freeUntilISO: string | null;
  /** "Thu, 22 Oct, 11:59 PM IST" */
  freeUntilLabel: string | null;
  /** Whether personal holds are running on the server. */
  holdEnabled: boolean;
  holdMinutes: number;
  /** This visitor's hold end, when the server already knew it at render time. */
  holdEndsISO: string | null;
  /** Whether a ₹999 payment can be taken right now (Razorpay usable). */
  paymentsReady: boolean;
  /** Display-only countdown length used when no server limit is configured. */
  displayTimerMinutes: number;
};

export type OfferState = {
  phase: OfferPhase;
  msLeft: number | null;
  /** Which limit the countdown is showing. */
  endsBy: "hold" | "festive" | null;
  holdEndsAt: Date | null;
};

/** Current price state, flipping from free to paid on the client when a limit passes. */
export function useOfferPhase(props: PricingProps): OfferState {
  const { initialPhase, freeUntilISO, holdEnabled, holdEndsISO, displayTimerMinutes } = props;
  const [holdEnds, setHoldEnds] = useState<number | null>(holdEndsISO ? new Date(holdEndsISO).getTime() : null);
  const [now, setNow] = useState<number | null>(null);
  const [visitStart, setVisitStart] = useState<number | null>(null);
  const displayOnly = !holdEnabled && !freeUntilISO && displayTimerMinutes > 0 && initialPhase === "free";

  // Display-only mode: count down from the start of this visit, restarting at zero.
  useEffect(() => {
    if (!displayOnly) return;
    const start = Date.now();
    setVisitStart(start);
    setNow(start);
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [displayOnly]);

  // First visit: ask the server to start this visitor's hold (sets the signed cookie).
  useEffect(() => {
    if (!holdEnabled || holdEnds !== null || initialPhase === "paid") return;
    fetch("/api/masterclass/hold", { method: "POST" })
      .then((r) => r.json())
      .then((d: { holdEndsAt?: string | null }) => {
        if (d.holdEndsAt) setHoldEnds(new Date(d.holdEndsAt).getTime());
      })
      .catch(() => {});
  }, [holdEnabled, holdEnds, initialPhase]);

  const festive = freeUntilISO ? new Date(freeUntilISO).getTime() : null;
  const candidates = [holdEnds, festive].filter((x): x is number => x !== null);
  const deadline = candidates.length ? Math.min(...candidates) : null;

  useEffect(() => {
    if (!deadline) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [deadline]);

  if (displayOnly) {
    if (visitStart === null || now === null) return { phase: "free", msLeft: null, endsBy: null, holdEndsAt: null };
    const period = displayTimerMinutes * 60_000;
    const msLeft = period - ((now - visitStart) % period);
    return { phase: "free", msLeft, endsBy: null, holdEndsAt: null };
  }

  const endsBy = deadline === null ? null : deadline === holdEnds ? "hold" : "festive";
  const holdEndsAt = holdEnds ? new Date(holdEnds) : null;
  if (initialPhase === "paid") return { phase: "paid", msLeft: 0, endsBy, holdEndsAt };
  if (!deadline || now === null) return { phase: initialPhase, msLeft: null, endsBy, holdEndsAt };
  const msLeft = deadline - now;
  return { phase: msLeft > 0 ? "free" : "paid", msLeft: Math.max(0, msLeft), endsBy, holdEndsAt };
}

function parts(ms: number) {
  const s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

function Countdown({ ms }: { ms: number }) {
  const { d, h, m, s } = parts(ms);
  const cells = [
    ...(d > 0 ? [{ v: d, l: d === 1 ? "day" : "days" }] : []),
    ...(d > 0 || h > 0 ? [{ v: h, l: "hrs" }] : []),
    { v: m, l: "min" },
    { v: s, l: "sec" },
  ];
  const urgent = d === 0 && h === 0 && m < 5;
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-danger">Offer ends in</span>
      <div className="flex items-center gap-1" aria-hidden>
        {cells.map((c, i) => (
          <span key={c.l} className="flex items-center gap-1">
            {i > 0 && <span className="font-display text-xl font-bold text-danger">:</span>}
            <span
              className={`flex min-w-[3.1rem] flex-col items-center rounded-msc bg-gradient-to-b from-danger to-[#7A1710] px-1.5 py-1.5 text-white shadow-[0_6px_16px_-6px_rgba(180,35,24,0.6)] ${
                urgent ? "motion-safe:animate-pulse" : ""
              }`}
            >
              <span className="font-display text-2xl font-bold tabular-nums leading-none">{String(c.v).padStart(2, "0")}</span>
              <span className="mt-0.5 text-[0.55rem] font-semibold uppercase tracking-wide text-white/80">{c.l}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function PricingBanner(props: PricingProps & OfferState) {
  const { phase, msLeft, holdMinutes, paymentsReady } = props;

  if (phase === "paid" && !paymentsReady) {
    return (
      <div role="status" className="rounded-msc-md border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-ink">
        <strong className="font-semibold">Offer expired.</strong> Your {holdMinutes}-minute free registration
        window has ended. Please check back shortly.
      </div>
    );
  }

  if (phase === "paid") {
    return (
      <div className="rounded-msc-md border border-brand-navy/10 bg-brand-pale/60 px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-brand-navy">Registration fee</span>
          <span className="font-display text-2xl font-bold text-brand-navy">{MASTERCLASS_EVENT.priceLabel}</span>
        </div>
        <p className="mt-1 text-xs text-muted">Your {holdMinutes}-minute free registration window has ended.</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-msc-lg border-2 border-danger/40 bg-gradient-to-br from-[#FFF4E5] via-white to-[#FFE9E6] px-4 py-4 shadow-[0_10px_30px_-12px_rgba(180,35,24,0.45)]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-pill bg-danger px-2.5 py-1 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-white">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            Limited-time offer
          </p>
          <p className="mt-2 flex items-baseline gap-2.5">
            <span
              className="text-xl font-semibold text-muted line-through decoration-danger decoration-[3px]"
              aria-label={`Regular price ${MASTERCLASS_EVENT.priceLabel}`}
            >
              {MASTERCLASS_EVENT.priceLabel}
            </span>
            <span className="font-display text-4xl font-black tracking-tight text-success">FREE</span>
          </p>
        </div>
        {msLeft !== null && msLeft > 0 && <Countdown ms={msLeft} />}
      </div>
    </div>
  );
}

// ── Razorpay Checkout ────────────────────────────────────────────────

type RazorpaySuccess = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

type RazorpayInstance = { open: () => void; on: (event: string, cb: (r: unknown) => void) => void };
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

// Read through a local type: the enrollment page declares its own global shape.
const rzpCtor = () => (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;

let checkoutScript: Promise<void> | null = null;

/** Load Razorpay's checkout.js once, on demand (only for paid registrations). */
export function loadRazorpay(): Promise<void> {
  if (typeof window !== "undefined" && rzpCtor()) return Promise.resolve();
  checkoutScript ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      checkoutScript = null;
      reject(new Error("checkout.js failed to load"));
    };
    document.head.appendChild(s);
  });
  return checkoutScript;
}

/**
 * Open the checkout and settle on one outcome: paid (with Razorpay's signed
 * response), dismissed, or failed.
 */
export function openCheckout(opts: {
  keyId: string;
  orderId: string;
  amount: number;
  prefill: { name: string; email: string; contact: string };
}): Promise<{ status: "paid"; response: RazorpaySuccess } | { status: "dismissed" } | { status: "failed"; reason: string }> {
  return new Promise((resolve) => {
    let settled = false;
    // Razorpay keeps the modal open after a failed attempt so the student can
    // retry; only report the failure if they then close it without paying.
    let lastFailure: string | null = null;
    const done = (r: Parameters<typeof resolve>[0]) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const Razorpay = rzpCtor()!;
    const rzp = new Razorpay({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: opts.amount,
      currency: "INR",
      name: "MedSkills Catalyst",
      description: `${MASTERCLASS_EVENT.sessionTitle} · ${MASTERCLASS_EVENT.dateLabel}`,
      image: "/brand/logo/MedSkills-Catalyst_Logo.png",
      prefill: opts.prefill,
      theme: { color: "#00589E" },
      handler: (response: RazorpaySuccess) => done({ status: "paid", response }),
      modal: {
        ondismiss: () => done(lastFailure ? { status: "failed", reason: lastFailure } : { status: "dismissed" }),
      },
    });
    rzp.on("payment.failed", (r) => {
      lastFailure = (r as { error?: { description?: string } })?.error?.description ?? "Payment failed";
    });
    rzp.open();
  });
}
