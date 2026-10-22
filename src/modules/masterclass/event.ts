/**
 * Fixed facts about the 24 October 2026 masterclass. Safe to import from
 * client components: nothing here is secret or environment-dependent.
 *
 * Everything that is NOT yet confirmed (start time, Zoom link, WhatsApp
 * community invite) lives in server-side environment variables instead — see
 * ./config.ts — so the page never hard-codes a guess.
 */
export const MASTERCLASS_EVENT = {
  /** Stored on every registration; unique per student per event. */
  key: "masterclass-2026-10-24",
  title: "MedSkills Catalyst Masterclass",
  /** Session name as published on the Zoom invite. */
  sessionTitle: "Medtech 101: Your First Step into the Medtech Industry",
  dateISO: "2026-10-24",
  dateLabel: "24 October 2026",
  dayDateLabel: "Saturday, 24 October 2026",
  platform: "Zoom",
  path: "/cohort/october-24",
  thankYouPath: "/cohort/october-24/thank-you",
  /** Regular price once the festive free offer ends. */
  pricePaise: 99_900,
  priceLabel: "₹999",
  /** Length of the on-page offer countdown. Display only; restarts each visit. */
  offerTimerMinutes: 30,
  /** Bump whenever the consent sentence on the form changes. */
  consentTextVersion: "masterclass-2026-10-24-v1",
} as const;

export const SITE_URL = "https://www.medskillscatalyst.com";
export const PRIVACY_POLICY_PATH = "/privacy-policy";
export const SUPPORT_EMAIL = "info@medskillscatalyst.com";
