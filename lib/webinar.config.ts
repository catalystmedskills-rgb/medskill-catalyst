/**
 * Single source of truth for webinar-specific values.
 * Change the event details here and every component + the calendar
 * file + the API stay in sync.  Anything wrapped in [PLACEHOLDER]
 * MUST be replaced with a real, verifiable value before launch.
 */

export const WEBINAR = {
  title: "Break Into MedTech Sales in 90 Days",
  subtitle: "The unwritten playbook career-switchers use to land interviews at global MedTech brands — no prior device experience required.",

  // TODO: Reconcile date — brief says July 4th, live site references June 7th.
  // Set the confirmed real date + time + timezone before launch.
  startISO: "2026-07-04T11:00:00+05:30",
  endISO:   "2026-07-04T12:30:00+05:30",
  dateLabel: "Saturday, 4 July 2026",
  timeLabel: "11:00 AM IST",
  durationLabel: "90 minutes",
  platformLabel: "Live on Zoom",
  price: "Free",

  // TODO: Replace with real destinations before launch.
  whatsappGroupUrl: "https://chat.whatsapp.com/[PLACEHOLDER_GROUP_INVITE]",
  whatsappContactUrl: "https://wa.me/918800665154",
  leadMagnetUrl: "/downloads/medtech-career-guide.pdf", // [PLACEHOLDER asset]
  leadMagnetTitle: "MedTech Career Transition Guide (28-page PDF)",

  // TODO: Replace with real support email.
  supportEmail: "info@medskillscatalyst.com",

  // Social proof — keep honest. Use real running counts or leave the
  // counter hidden. Do NOT hardcode an inflated number.
  showRegistrationCounter: false, // flip on only when wired to a real count
} as const;

export type WebinarConfig = typeof WEBINAR;
