import posthog from "posthog-js";
import type { TrackingFields, UserType } from "./types";

/**
 * Typed analytics layer. All six required events flow through `track`.
 * If PostHog isn't initialised (e.g. key missing) calls no-op safely,
 * and everything is also pushed to window.dataLayer so GTM/GA4 can
 * pick it up without code changes.
 */

export type WebinarEvent =
  | "page_visit"
  | "cta_click"
  | "form_start"
  | "form_submit"
  | "whatsapp_join"
  | "lead_magnet_download";

type EventProps = Record<string, unknown>;

let initialised = false;

export function initAnalytics() {
  if (initialised || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (key) {
    posthog.init(key, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      capture_pageview: false, // we fire page_visit explicitly
      person_profiles: "always",
    });
  }
  initialised = true;
}

export function track(event: WebinarEvent, props: EventProps = {}) {
  trackEvent(event, props, "webinar_landing");
}

/**
 * Surface-agnostic variant of `track` for other landing pages. Same fan-out
 * (PostHog when configured, dataLayer, gtag). Never pass personal data —
 * names, emails and phone numbers must not reach analytics.
 */
export function trackEvent(event: string, props: EventProps = {}, surface: string) {
  if (typeof window === "undefined") return;
  const payload = { ...props, surface };

  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    try {
      posthog.capture(event, payload);
    } catch {
      /* ignore */
    }
  }
  // Mirror to dataLayer for GA4 / GTM.
  const win = window as unknown as {
    dataLayer?: unknown[];
    gtag?: (command: string, action: string, params?: Record<string, unknown>) => void;
  };
  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push({
    event,
    ...payload,
  });

  // Direct call to GA4 if initialized
  if (typeof win.gtag === "function") {
    try {
      win.gtag("event", event, payload);
    } catch {
      /* ignore */
    }
  }
}

/** Convenience wrappers used across components. */
export const trackPageVisit = (t: TrackingFields) =>
  track("page_visit", { ...t });

export const trackCtaClick = (label: string, location: string) =>
  track("cta_click", { label, location });

export const trackFormStart = () => track("form_start", {});

export const trackFormSubmit = (userType: UserType, t: TrackingFields) =>
  track("form_submit", { user_type: userType, ...t });

export const trackWhatsappJoin = () => track("whatsapp_join", {});

export const trackLeadMagnetDownload = () =>
  track("lead_magnet_download", {});
