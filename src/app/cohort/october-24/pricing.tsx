"use client";

import { useEffect, useState } from "react";
import { MASTERCLASS_EVENT } from "@/src/modules/masterclass/event";

/**
 * Festive-offer pricing. Two real limits, both enforced on the server:
 *   - the festive deadline (MASTERCLASS_FREE_UNTIL), the same for everyone, and
 *   - this visitor's personal free hold (default 30 minutes from their first
 *     visit, kept in a signed cookie so refreshing never restarts it).
 * Whichever ends first sets the countdown. This component only displays the
 * price; the server re-checks it on submit.
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
  const { initialPhase, freeUntilISO, holdEnabled, holdEndsISO } = props;
  const [holdEnds, setHoldEnds] = useState<number | null>(holdEndsISO ? new Date(holdEndsISO).getTime() : null);
  const [now, setNow] = useState<number | null>(null);

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
  return (
    <div className="flex gap-1.5" aria-hidden>
      {cells.map((c) => (
        <span key={c.l} className="flex min-w-[2.6rem] flex-col items-center rounded-msc bg-brand-navy px-1.5 py-1 text-white">
          <span className="font-display text-base font-bold tabular-nums leading-tight">{String(c.v).padStart(2, "0")}</span>
          <span className="text-[0.58rem] font-semibold uppercase tracking-wide text-white/70">{c.l}</span>
        </span>
      ))}
    </div>
  );
}

export function PricingBanner(props: PricingProps & OfferState) {
  const { phase, msLeft, holdMinutes, paymentsReady } = props;

  if (phase === "paid" && !paymentsReady) {
    return (
      <div role="status" className="rounded-msc-md border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-ink">
        <strong className="font-semibold">Registration is paused.</strong> Your {holdMinutes}-minute free registration
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
    <div className="rounded-msc-md border border-success/25 bg-success/5 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-success">Festive offer</p>
          <p className="mt-0.5 flex items-baseline gap-2">
            <span className="text-base font-semibold text-muted line-through decoration-2" aria-label={`Regular price ${MASTERCLASS_EVENT.priceLabel}`}>
              {MASTERCLASS_EVENT.priceLabel}
            </span>
            <span className="font-display text-2xl font-bold text-brand-navy">FREE</span>
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
