import type { Attribution } from "./schema";

/** Mirrors the LeadSource enum in prisma/schema.prisma. */
export type LeadSourceValue =
  | "ORGANIC"
  | "GOOGLE_ADS"
  | "META_ADS"
  | "WHATSAPP"
  | "REFERRAL"
  | "MANUAL"
  | "IMPORT";

const META_SOURCES = /^(facebook|fb|instagram|ig|meta|an|messenger)$/i;
const PAID_MEDIUMS = /^(cpc|ppc|paid|paid[_ -]?social|paidsocial|ads?|display|cpm|sponsored)$/i;

/**
 * Classify a registration for the CRM's lead-source column.
 *
 * Conservative on purpose: `fbclid` is appended to EVERY outbound Facebook
 * click, organic posts included, so it alone does not mean "paid". Only an
 * explicit paid utm_medium (or a Google Ads gclid) marks a lead as paid.
 */
export function leadSourceFor(a: Attribution): LeadSourceValue {
  const source = (a.utm_source ?? "").trim();
  const medium = (a.utm_medium ?? "").trim();
  if (a.gclid || (/^(google|adwords)$/i.test(source) && PAID_MEDIUMS.test(medium))) return "GOOGLE_ADS";
  if (META_SOURCES.test(source) && PAID_MEDIUMS.test(medium)) return "META_ADS";
  if (/whatsapp/i.test(source) || /whatsapp/i.test(medium)) return "WHATSAPP";
  if (/referral/i.test(medium)) return "REFERRAL";
  return "ORGANIC";
}
