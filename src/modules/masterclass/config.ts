/**
 * Server-side masterclass configuration, read from environment variables.
 *
 * Pure functions over an env object (default: process.env) so the rules can be
 * unit-tested. Import only from server code — the values include the Zoom
 * joining link, which must never reach the landing page.
 *
 *   MASTERCLASS_REGISTRATION_OPEN       "true" to accept registrations
 *   MASTERCLASS_ZOOM_JOIN_URL           https://…zoom.us/j/… (emailed, never rendered)
 *   MASTERCLASS_START_TIME_IST          "HH:mm", 24-hour, IST
 *   MASTERCLASS_DURATION_MINUTES        optional, e.g. "90"
 *   MASTERCLASS_ZOOM_PASSCODE           optional; printed in the email as a fallback
 *   MASTERCLASS_WHATSAPP_COMMUNITY_URL  https://chat.whatsapp.com/…
 *   MASTERCLASS_FREE_UNTIL              ISO time with offset; free before it,
 *                                       ₹999 via Razorpay after it. Unset = free.
 *   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET  existing Razorpay integration
 *   RESEND_API_KEY                      existing Resend integration
 *
 * Registrations stay closed until the flag is on AND the Zoom link, start time
 * and Resend key are all valid, so a half-configured deploy can never collect
 * students it cannot email.
 */

import { MASTERCLASS_EVENT } from "./event";

type Env = Record<string, string | undefined>;

export type MasterclassConfig = {
  zoomUrl: string | null;
  /** "812 3456 7890", derived from the join link. */
  zoomMeetingId: string | null;
  zoomPasscode: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  whatsappUrl: string | null;
  flagOn: boolean;
  resendConfigured: boolean;
  /** End of the festive free-registration offer; null = always free. */
  freeUntil: Date | null;
  razorpayConfigured: boolean;
};

export type MasterclassReadiness = {
  /** True only when registrations may be accepted. */
  open: boolean;
  /** Human-readable list of what is missing or invalid. */
  missing: string[];
};

// Anything that still looks like a template value is treated as unset.
const PLACEHOLDER = /placeholder|\[|\]|example\.com|changeme/i;

function clean(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t || PLACEHOLDER.test(t)) return null;
  return t;
}

function httpsUrl(v: string | null): URL | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** A Zoom join link: https, on zoom.us / zoom.com (incl. vanity subdomains). */
export function parseZoomUrl(v: string | undefined): string | null {
  const u = httpsUrl(clean(v));
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  const isZoom = /(^|\.)zoom\.(us|com)$/.test(host) || /(^|\.)zoomgov\.com$/.test(host);
  return isZoom && u.pathname.length > 1 ? u.toString() : null;
}

/** A WhatsApp group / community invite: https://chat.whatsapp.com/<code>. */
export function parseWhatsappUrl(v: string | undefined): string | null {
  const u = httpsUrl(clean(v));
  if (!u) return null;
  const ok = u.hostname.toLowerCase() === "chat.whatsapp.com" && /^\/[A-Za-z0-9]{10,}\/?$/.test(u.pathname);
  return ok ? u.toString() : null;
}

/** "HH:mm" 24-hour. */
export function parseStartTime(v: string | undefined): string | null {
  const t = clean(v);
  return t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null;
}

export function parseDuration(v: string | undefined): number | null {
  const t = clean(v);
  if (!t || !/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= 15 && n <= 480 ? n : null;
}

/** "https://us06web.zoom.us/j/81234567890?pwd=…" → "812 3456 7890". */
export function zoomMeetingIdFrom(url: string | null): string | null {
  if (!url) return null;
  const m = new URL(url).pathname.match(/\/(?:j|w|s)\/(\d{9,11})/);
  if (!m) return null;
  const d = m[1];
  return d.length === 11 ? `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}` : d.replace(/(\d{3})(?=\d)/g, "$1 ");
}

export function readMasterclassConfig(env: Env = process.env): MasterclassConfig {
  const zoomUrl = parseZoomUrl(env.MASTERCLASS_ZOOM_JOIN_URL);
  const passcode = clean(env.MASTERCLASS_ZOOM_PASSCODE);
  return {
    zoomUrl,
    zoomMeetingId: zoomMeetingIdFrom(zoomUrl),
    zoomPasscode: passcode && /^[A-Za-z0-9]{1,20}$/.test(passcode) ? passcode : null,
    startTime: parseStartTime(env.MASTERCLASS_START_TIME_IST),
    durationMinutes: parseDuration(env.MASTERCLASS_DURATION_MINUTES),
    whatsappUrl: parseWhatsappUrl(env.MASTERCLASS_WHATSAPP_COMMUNITY_URL),
    flagOn: (env.MASTERCLASS_REGISTRATION_OPEN ?? "").trim().toLowerCase() === "true",
    resendConfigured: Boolean(clean(env.RESEND_API_KEY) || clean(env.Resend_Api_key)),
    freeUntil: parseFreeUntil(env.MASTERCLASS_FREE_UNTIL),
    razorpayConfigured: Boolean(clean(env.RAZORPAY_KEY_ID) && clean(env.RAZORPAY_KEY_SECRET)),
  };
}

/**
 * The free-offer deadline. Must carry an explicit offset (or Z) so a server in
 * UTC and a reader in IST agree on the same instant.
 */
export function parseFreeUntil(v: string | undefined): Date | null {
  const t = clean(v);
  if (!t || !/(Z|[+-]\d{2}:\d{2})$/.test(t)) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The session's start as an instant, from the fixed date and the IST start time. */
export function masterclassStartsAt(cfg: Pick<MasterclassConfig, "startTime">): Date | null {
  return cfg.startTime ? new Date(`${MASTERCLASS_EVENT.dateISO}T${cfg.startTime}:00+05:30`) : null;
}

export type PricingPhase = {
  /** free: festive offer running · paid: ₹999 · closed: the session has started. */
  phase: "free" | "paid" | "closed";
  amountPaise: number;
  freeUntil: Date | null;
};

/**
 * What a registration costs right now. One real deadline for everyone — never
 * a per-visitor timer — so the countdown on the page is always the truth.
 */
export function pricingAt(cfg: MasterclassConfig, now: Date = new Date()): PricingPhase {
  const startsAt = masterclassStartsAt(cfg);
  if (startsAt && now >= startsAt) return { phase: "closed", amountPaise: 0, freeUntil: cfg.freeUntil };
  if (!cfg.freeUntil || now < cfg.freeUntil) return { phase: "free", amountPaise: 0, freeUntil: cfg.freeUntil };
  return { phase: "paid", amountPaise: MASTERCLASS_EVENT.pricePaise, freeUntil: cfg.freeUntil };
}

/** "Thu, 22 Oct, 11:59 PM IST" */
export function formatDeadline(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(d);
  return `${parts.replace(/\b(am|pm)\b/, (s) => s.toUpperCase())} IST`;
}

export function masterclassReadiness(cfg: MasterclassConfig): MasterclassReadiness {
  const missing: string[] = [];
  if (!cfg.flagOn) missing.push("MASTERCLASS_REGISTRATION_OPEN is not \"true\"");
  if (!cfg.zoomUrl) missing.push("MASTERCLASS_ZOOM_JOIN_URL is missing or not a Zoom https link");
  if (!cfg.startTime) missing.push("MASTERCLASS_START_TIME_IST is missing or not HH:mm");
  if (!cfg.resendConfigured) missing.push("RESEND_API_KEY is missing");
  if (cfg.freeUntil && !cfg.razorpayConfigured) {
    missing.push("MASTERCLASS_FREE_UNTIL is set but Razorpay keys are missing, so paid registration can't work");
  }
  return { open: missing.length === 0, missing };
}

/** "18:00" → "6:00 PM". */
export function formatTime12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "6:00 PM – 7:30 PM IST", or "6:00 PM IST" without a duration, or null. */
export function timeLabel(cfg: Pick<MasterclassConfig, "startTime" | "durationMinutes">): string | null {
  if (!cfg.startTime) return null;
  const start = formatTime12h(cfg.startTime);
  if (!cfg.durationMinutes) return `${start} IST`;
  const [h, m] = cfg.startTime.split(":").map(Number);
  const endTotal = (h * 60 + m + cfg.durationMinutes) % (24 * 60);
  const end = formatTime12h(
    `${String(Math.floor(endTotal / 60)).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`,
  );
  return `${start} – ${end} IST`;
}
