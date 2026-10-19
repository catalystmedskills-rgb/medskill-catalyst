"use client";

import { initAnalytics, trackEvent } from "@/lib/analytics";
import { fbTrack } from "@/src/lib/meta-pixel";
import type { Attribution } from "./schema";

/**
 * Masterclass funnel events. Properties are limited to non-personal context
 * (where on the page, which status bucket, campaign source) — never a name,
 * email, phone number or university.
 */
export type MasterclassEvent =
  | "masterclass_page_view"
  | "masterclass_cta_click"
  | "masterclass_form_start"
  | "masterclass_registration_success"
  | "masterclass_registration_error"
  | "masterclass_thank_you_view"
  | "masterclass_whatsapp_click";

const SURFACE = "masterclass_oct24";

export function trackMasterclass(event: MasterclassEvent, props: Record<string, unknown> = {}) {
  try {
    initAnalytics();
    trackEvent(event, props, SURFACE);
  } catch {
    /* analytics must never break the page */
  }
}

export { fbTrack };

// ── Attribution (first touch, per browser session) ───────────────────

const ATTR_KEY = "msc_masterclass_attribution";
const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"] as const;

/**
 * Campaign parameters from the landing URL, merged over whatever this browser
 * session first arrived with. Stored in sessionStorage only — it never
 * outlives the tab and is sent once, with the registration.
 */
export function captureAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const fresh: Record<string, string> = {};
  for (const k of PARAMS) {
    const v = params.get(k);
    if (v) fresh[k] = v.slice(0, 300);
  }
  let stored: Record<string, string> = {};
  try {
    stored = JSON.parse(sessionStorage.getItem(ATTR_KEY) || "{}");
  } catch {
    /* ignore */
  }
  // A fresh campaign click wins over an older one in the same session.
  const hasFresh = Object.keys(fresh).length > 0;
  const merged: Record<string, string> = hasFresh ? { ...fresh } : { ...stored };
  merged.landing_page = (hasFresh ? undefined : stored.landing_page) ?? window.location.pathname;
  const ref = document.referrer;
  if (ref && !ref.startsWith(window.location.origin)) {
    // Origin + path only: query strings on referrers can carry personal data.
    try {
      const u = new URL(ref);
      merged.referrer = (hasFresh ? undefined : stored.referrer) ?? `${u.origin}${u.pathname}`.slice(0, 300);
    } catch {
      /* ignore */
    }
  } else if (stored.referrer && !hasFresh) {
    merged.referrer = stored.referrer;
  }
  try {
    sessionStorage.setItem(ATTR_KEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
  return merged;
}

/** Campaign context safe to attach to analytics events. */
export function campaignProps(a: Attribution): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const) {
    if (a[k]) out[k] = a[k]!;
  }
  return out;
}

export function newEventId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `mc_${rand}`.slice(0, 60);
}
