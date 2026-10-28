"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Accordion, AccordionItem } from "@/src/components/ui/accordion";
import { SiteHeader } from "@/src/components/site-header";
import { EnrollmentForm } from "./enrollment-form";
import { fbTrack } from "@/src/lib/meta-pixel";
import { COURSE_OUTLINES, DEFAULT_OUTLINE } from "../course-data";
import type { EnrollmentApplication } from "@/src/modules/enroll/schemas";
import { type UploadScope } from "@/src/modules/enroll/upload-client";
import {
  submitEnrollmentApplication,
  submitPublicEnrollmentApplication,
  createOrderAction,
  createPublicOrderAction,
  verifyPaymentAction,
  markPaymentFailedAction,
} from "./actions";

export type EnrollFlow =
  | { kind: "token"; token: string }
  | { kind: "public"; courseSlug: string };

type RazorpayHandlerResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open: () => void;
  on: (event: string, cb: (resp: { error?: { description?: string } }) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

/** Inject checkout.js once; resolves true when the SDK is available. */
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export type EnrollPageData = {
  token: string;
  alreadyCompleted: boolean;
  alreadyPaid: boolean;
  course: {
    name: string;
    description: string | null;
    durationWeeks: number | null;
    mode: string;
    gstRatePct: number;
  };
  batch: { name: string; startDate: string | null; seatCapacity: number };
  pricePaise: number;
  discountPaise: number;
  expiresAt: string;
  lead: { name: string; email: string; phone: string | null };
};

const WHATSAPP_URL = "https://wa.me/918800665154";

function inr(paise: number) {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

// Columns that sit side-by-side fade WITHOUT vertical travel, so they never
// appear misaligned while animating in.
const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
};

/* ── Thin-stroke icons (inherit currentColor → stay on-palette) ───────── */
type IconProps = { className?: string };
const svgBase = "none";
function IconCheck({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={svgBase} className={className} aria-hidden>
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconLock({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={svgBase} className={className} aria-hidden>
      <rect x="4" y="10" width="16" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconReceipt({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={svgBase} className={className} aria-hidden>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconSeat({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={svgBase} className={className} aria-hidden>
      <path d="M7 10V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="5" y="10" width="14" height="5" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 15v3M17 15v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconSpark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={svgBase} className={className} aria-hidden>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconShield({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={svgBase} className={className} aria-hidden>
      <path d="M12 3 5 6v6c0 4 3 6.5 7 9 4-2.5 7-5 7-9V6l-7-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconCalendar({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={svgBase} className={className} aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** A trust line item used across the page. */
function TrustLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-cyan" />
      <span>{children}</span>
    </li>
  );
}

export function EnrollClient({ data, flow }: { data: EnrollPageData; flow?: EnrollFlow }) {
  const resolvedFlow: EnrollFlow = flow ?? { kind: "token", token: data.token };
  const token = resolvedFlow.kind === "token" ? resolvedFlow.token : null;
  const courseSlug = resolvedFlow.kind === "public" ? resolvedFlow.courseSlug : null;
  const isPublic = resolvedFlow.kind === "public";

  const uploadScope: UploadScope =
    resolvedFlow.kind === "token"
      ? { token: resolvedFlow.token }
      : { courseSlug: resolvedFlow.courseSlug };

  const [reserved, setReserved] = useState(data.alreadyCompleted);
  const [paid, setPaid] = useState(data.alreadyPaid);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Load program outline copy details based on course slug
  const slug = resolvedFlow.kind === "public" ? resolvedFlow.courseSlug : "foundation-program";
  const outline = COURSE_OUTLINES[slug] ?? DEFAULT_OUTLINE;

  const nameParts = data.lead.name.trim().split(/\s+/);
  const firstName = nameParts[0] || "there";
  const defaults = {
    firstName: nameParts[0] ?? "",
    lastName: nameParts.slice(1).join(" "),
    email: data.lead.email,
    phone: data.lead.phone ?? "",
  };

  // GST-inclusive breakdown for the fee card (transparency / trust).
  const total = data.pricePaise;
  const gstRate = data.course.gstRatePct || 18;
  const base = Math.round(total / (1 + gstRate / 100));
  const gst = total - base;

  // Flow-agnostic form submit (token-based vs public per-course).
  const submitForm = useCallback(
    (values: EnrollmentApplication) =>
      token
        ? submitEnrollmentApplication(token, values)
        : submitPublicEnrollmentApplication(courseSlug as string, values),
    [token, courseSlug],
  );

  const startPayment = useCallback(
    async (eid?: string) => {
      setPayError(null);
      setPaying(true);

      const activeId = eid ?? enrollmentId;
      const res = token
        ? await createOrderAction(token)
        : activeId
          ? await createPublicOrderAction(activeId)
          : ({ status: "error", message: "Missing enrollment reference. Please refresh and try again." } as const);

      if (res.status !== "success") {
        if (/already confirmed/i.test(res.message)) setPaid(true);
        else setPayError(res.message);
        setPaying(false);
        return;
      }

      const order = res.order;
      const ready = await loadRazorpayScript();
      if (!ready || !window.Razorpay) {
        setPayError("Couldn't load the payment window. Check your connection and try again.");
        setPaying(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: "MedSkills Catalyst",
        description: order.courseName,
        prefill: order.prefill,
        notes: { enrollment_id: order.enrollmentId },
        theme: { color: "#0A2A43" },
        handler: async (resp: RazorpayHandlerResponse) => {
          const v = await verifyPaymentAction({
            token: token ?? "",
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          });
          if (v.status === "success") {
            setPaid(true);
            setPayError(null);
            fbTrack("Purchase", {
              currency: "INR",
              value: order.amountPaise / 100,
              content_name: order.courseName,
            });
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else {
            setPayError(v.message);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
          setPaying(false);
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
          },
        },
      });

      rzp.on("payment.failed", (resp) => {
        void markPaymentFailedAction(order.orderId, resp?.error?.description);
        setPayError(resp?.error?.description || "Payment failed. Please try again.");
        setPaying(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      rzp.open();
    },
    [token, enrollmentId],
  );

  const payLabel = paying ? "Opening secure checkout…" : `Pay ${inr(data.pricePaise)} securely`;

  return (
    <div className="min-h-screen bg-[#F6F8FA] font-body text-ink antialiased relative">
      {/* subtle canvas grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.03] [background-image:linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)] [background-size:40px_40px]"
      />

      <SiteHeader />

      <main className="relative z-10 mx-auto max-w-6xl px-5 py-8 sm:py-14">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:items-start">
          
          {/* ── Left Column: Course details ── */}
          <div className="md:col-span-7 space-y-6 pr-0 md:pr-6">
            <div className="flex items-center gap-3">
              <img
                src="/brand/logo/MedSkills-Catalyst_Logo-01.svg"
                alt="MedSkills Catalyst"
                className="h-10 w-auto bg-white p-1 rounded border border-brand-navy/10"
              />
              <div>
                <h1 className="font-display text-lg font-bold leading-none text-brand-navy">
                  MedSkills Catalyst
                </h1>
                <p className="mt-1 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-muted">
                  Upskill to Upscale
                </p>
              </div>
            </div>

            <h2 className="font-display text-3xl font-extrabold tracking-tight text-brand-navy sm:text-4xl">
              {data.course.name}
            </h2>

            <p className="text-base leading-relaxed text-muted">
              {outline.tagline}
            </p>

            {/* Course details bullet list */}
            <div className="space-y-4 pt-6 border-t border-brand-navy/10 mt-6">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-brand-navy">
                Course Highlights
              </h3>
              <ul className="space-y-3.5 text-sm text-muted">
                {outline.outcomes.map((o, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <IconCheck className="h-4 w-4 shrink-0 text-brand-blue mt-0.5" />
                    <span>
                      <strong className="text-brand-navy font-semibold">{o.title}:</strong> {o.desc}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact details */}
            <div className="space-y-3 pt-6 border-t border-brand-navy/10 mt-6">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-brand-navy">
                Contact Us
              </h3>
              <div className="flex flex-col gap-2 text-sm text-muted">
                <a href="mailto:info@medskillscatalyst.com" className="inline-flex items-center gap-2 hover:text-brand-blue">
                  <IconReceipt className="h-4 w-4 text-brand-blue" /> info@medskillscatalyst.com
                </a>
                <a href="https://wa.me/918800665154" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-brand-blue">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-brand-blue" aria-hidden>
                    <path d="M12.001 2.001C6.478 2.001 2 6.477 2 12c0 1.936.549 3.744 1.501 5.278L2 22l4.835-1.469A9.96 9.96 0 0 0 12 22c5.523 0 10-4.477 10-10S17.524 2.001 12.001 2.001zm0 18a7.969 7.969 0 0 1-4.065-1.112l-.291-.173-3.012.915.915-2.936-.19-.303A7.97 7.97 0 0 1 4 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.588 8-7.999 8z" />
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  </svg>
                  +91 97592 49395
                </a>
              </div>
            </div>

            {/* Terms and Policies */}
            <div className="space-y-2 pt-6 border-t border-brand-navy/10 mt-6 text-xs text-muted leading-relaxed">
              <p>
                By enrolling, you agree to share information entered on this page with MedSkills Catalyst, and consent to their processing of your enrollment data.
              </p>
              <div className="flex gap-3">
                <a href="/terms-of-use" target="_blank" className="underline hover:text-brand-blue">Terms of Use</a>
                <span>·</span>
                <a href="/privacy-policy" target="_blank" className="underline hover:text-brand-blue">Privacy Policy</a>
                <span>·</span>
                <a href="/refund-policy" target="_blank" className="underline hover:text-brand-blue">Refund Policy</a>
              </div>
            </div>
          </div>

          {/* ── Right Column: Payment Details Card ── */}
          <div className="md:col-span-5">
            <div className="relative overflow-hidden rounded-msc-xl bg-surface shadow-msc-float border border-brand-navy/[0.05]">
              {/* Top Accent Line */}
              <div className="h-1.5 w-full bg-brand-blue" />
              
              <div className="p-6 sm:p-8 space-y-6">
                <div className="border-b border-brand-navy/[0.07] pb-3">
                  <h3 className="font-display text-xl font-bold text-brand-navy">
                    Payment Details
                  </h3>
                  <div className="h-1 w-10 bg-brand-blue mt-2" />
                </div>

                {paid ? (
                  <div className="text-center py-6 space-y-5">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
                      <IconCheck className="h-7 w-7" />
                    </div>
                    <h4 className="font-display text-2xl font-bold text-brand-navy">
                      You&rsquo;re confirmed!
                    </h4>
                    <p className="text-sm text-muted leading-relaxed max-w-sm mx-auto">
                      Your seat in <strong className="text-ink">{data.course.name}</strong> is officially confirmed. A GST tax invoice and onboarding instructions have been sent to your email.
                    </p>
                    <a
                      href={WHATSAPP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-pill bg-wa px-6 text-sm font-semibold text-white transition hover:opacity-90 w-full"
                    >
                      Chat with us on WhatsApp
                    </a>
                  </div>
                ) : reserved ? (
                  <div className="text-center py-6 space-y-5">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-pale text-brand-blue">
                      <IconSeat className="h-7 w-7" />
                    </div>
                    <h4 className="font-display text-2xl font-bold text-brand-navy">
                      Secure your seat
                    </h4>
                    <p className="text-sm text-muted leading-relaxed max-w-sm mx-auto">
                      Your application details are saved. Complete the program fee of <strong className="text-ink">{inr(data.pricePaise)}</strong> to secure your seat.
                    </p>
                    {payError && (
                      <p className="rounded-msc bg-danger/10 px-4 py-2.5 text-xs font-semibold text-danger">
                        {payError}
                      </p>
                    )}
                    <Button
                      size="lg"
                      className="w-full rounded-pill font-semibold shadow-msc-glow"
                      disabled={paying}
                      onClick={() => void startPayment()}
                    >
                      {payLabel} →
                    </Button>
                    <p className="text-center text-[10px] text-muted flex items-center justify-center gap-1">
                      <IconLock className="h-3 w-3" /> UPI · cards · net-banking, via Razorpay
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <EnrollmentForm
                      uploadScope={uploadScope}
                      submit={submitForm}
                      defaults={defaults}
                      pricePaise={data.pricePaise}
                      onReserved={(res) => {
                        setReserved(true);
                        setEnrollmentId(res.enrollmentId);
                        fbTrack(
                          "CompleteRegistration",
                          { content_name: "Enrollment completed" },
                          res.eventId,
                        );
                        void startPayment(res.enrollmentId);
                      }}
                    />

                    {/* Pricing selection styled like Razorpay */}
                    <div className="space-y-3 pt-6 border-t border-brand-navy/10 mt-6">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted block">
                        Course Fee Summary
                      </span>
                      
                      <div className="flex items-start gap-3 rounded-msc border border-brand-navy/10 bg-brand-pale/25 p-4">
                        <div className="flex h-5 items-center mt-0.5">
                          <input
                            id="primary-course-select"
                            type="checkbox"
                            checked
                            disabled
                            className="h-4 w-4 rounded border-brand-navy/20 text-brand-navy focus:ring-brand-navy/30"
                          />
                        </div>
                        <div className="flex-1 text-xs">
                          <label htmlFor="primary-course-select" className="font-bold text-brand-navy block">
                            {data.course.name}
                          </label>
                          <span className="text-[10px] text-muted block mt-0.5">
                            {data.batch.name} {data.batch.startDate ? `— Starts ${data.batch.startDate}` : ""}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-display text-sm font-bold text-brand-navy tabular-nums block">
                            {inr(data.pricePaise)}
                          </span>
                          {data.discountPaise > 0 && (
                            <span className="text-[10px] text-success block font-semibold line-through">
                              {inr(data.pricePaise + data.discountPaise)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* ── Checkout Loader Overlay ── */}
      {paying && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-brand-navy/60 backdrop-blur-sm text-white">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute h-16 w-16 animate-ping rounded-full bg-brand-cyan/20 opacity-70" />
            <div className="absolute h-14 w-14 animate-spin rounded-full border-2 border-white/5 border-t-brand-cyan" />
            <IconLock className="h-6 w-6 text-brand-cyan" />
          </div>
          <h3 className="mt-6 font-display text-xl font-medium tracking-tight">Opening secure checkout</h3>
          <p className="mt-2 text-sm text-white/60">Connecting to Razorpay. Please do not close this window.</p>
        </div>
      )}
    </div>
  );
}
