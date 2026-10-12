import { z } from "zod";
import { parseISODate, toISODate } from "./dates";
import { calendarDuration } from "./duration";

/**
 * Credential types (PRD addendum, 2026-10-04). One registry, one pipeline:
 * every type shares identifiers, lifecycle, templates, storage, email,
 * verification, audit, search and bulk issuance. A type only decides
 *
 *   - which extra details it records (validated, snapshotted in credentials.details),
 *   - its completion date and duplicate context,
 *   - what a template may print, and
 *   - which details the public verification page may show (an allowlist).
 *
 * Adding WORKSHOP, FELLOWSHIP, TRAINING or OBSERVERSHIP = add the enum value in
 * an additive migration + one entry here. No other table changes.
 *
 * Client-safe: no server or Prisma imports, so the admin form validates and
 * previews with exactly the rules the server enforces.
 */

export const CREDENTIAL_TYPES = ["COURSE_COMPLETION", "INTERNSHIP_COMPLETION", "OFFER_LETTER"] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];
export const credentialTypeSchema = z.enum(CREDENTIAL_TYPES);

export const INTERNSHIP_MODES = ["ON_SITE", "REMOTE", "HYBRID"] as const;
export type InternshipMode = (typeof INTERNSHIP_MODES)[number];
export const INTERNSHIP_MODE_LABELS: Record<InternshipMode, string> = { ON_SITE: "On-site", REMOTE: "Remote", HYBRID: "Hybrid" };

const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const text = (max: number) =>
  z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().max(max, `Keep it under ${max} characters`));
const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((s) => (s ?? "").normalize("NFC").replace(/\s+/g, " ").trim() || null)
    .pipe(z.string().max(max, `Keep it under ${max} characters`).nullable());

/** What an admin or a bulk row supplies for an internship. Duration is never an input. */
export const internshipInputSchema = z
  .object({
    internshipTitle: text(120).pipe(z.string().min(2, "Enter the internship name")),
    department: optionalText(120),
    startDate: isoDate,
    endDate: isoDate,
    totalHours: z
      .union([z.number(), z.string()])
      .nullish()
      .transform((v, ctx) => {
        if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
        const n = typeof v === "number" ? v : Number(v.trim());
        if (!Number.isFinite(n) || n <= 0 || n > 5000 || Math.round(n * 10) !== n * 10) {
          ctx.addIssue({ code: "custom", message: "Total hours must be a positive number up to 5000 (one decimal at most)" });
          return z.NEVER;
        }
        return n;
      }),
    supervisor: optionalText(120),
    mode: z
      .union([z.enum(INTERNSHIP_MODES), z.literal("")])
      .nullish()
      .transform((v) => (v ? v : null)),
    location: optionalText(120),
  })
  .superRefine((d, ctx) => {
    const start = parseISODate(d.startDate);
    const end = parseISODate(d.endDate);
    if (!start) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Start date is not a real date" });
    if (!end) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date is not a real date" });
    if (start && end && end.getTime() < start.getTime()) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date is before the start date" });
    }
    if (start && start.getUTCFullYear() < 2020) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Start date is implausibly early" });
  });
export type InternshipInput = z.input<typeof internshipInputSchema>;

/** What is snapshotted on the credential (credentials.details). The duration is computed, then frozen. */
export type InternshipDetails = z.output<typeof internshipInputSchema> & {
  duration: { label: string; days: number; months: number; remainderDays: number };
};

export function buildInternshipDetails(input: InternshipInput): InternshipDetails {
  const d = internshipInputSchema.parse(input);
  const duration = calendarDuration(parseISODate(d.startDate)!, parseISODate(d.endDate)!);
  return { ...d, duration };
}

/** Validates details previously stored by buildInternshipDetails (reading a credential). */
export const storedInternshipDetailsSchema = z.object({
  internshipTitle: z.string(),
  department: z.string().nullable(),
  startDate: isoDate,
  endDate: isoDate,
  totalHours: z.number().nullable(),
  supervisor: z.string().nullable(),
  mode: z.enum(INTERNSHIP_MODES).nullable(),
  location: z.string().nullable(),
  duration: z.object({ label: z.string(), days: z.number(), months: z.number(), remainderDays: z.number() }),
});

/** The public allowlist for an internship. Supervisor, mode, location and hours stay internal. */
export type PublicInternshipDetails = {
  internshipTitle: string;
  department: string | null;
  startDate: string;
  endDate: string;
  duration: string;
};

export function publicInternshipDetails(details: unknown): PublicInternshipDetails | null {
  const parsed = storedInternshipDetailsSchema.safeParse(details);
  if (!parsed.success) return null;
  const d = parsed.data;
  return { internshipTitle: d.internshipTitle, department: d.department, startDate: d.startDate, endDate: d.endDate, duration: d.duration.label };
}

// ── Offer letters (2026-10-12) ─────────────────────────────────────

export const OFFER_TYPES = ["INTERNSHIP", "CAMPUS_AMBASSADOR"] as const;
export type OfferType = (typeof OFFER_TYPES)[number];
export const OFFER_TYPE_LABELS: Record<OfferType, string> = { INTERNSHIP: "Internship", CAMPUS_AMBASSADOR: "Campus Ambassador" };
export const DURATION_UNITS = ["WEEKS", "MONTHS"] as const;
export const STIPEND_PERIODS = ["PER_MONTH", "TOTAL"] as const;
export type StipendPeriod = (typeof STIPEND_PERIODS)[number];

const HONORIFICS = new Set(["dr", "mr", "mrs", "ms", "miss", "prof", "shri", "smt", "kumari"]);

/** "Dr. Aanya Venkataraman" → "Aanya". The greeting can be overridden per letter. */
export function greetingName(fullName: string): string {
  const words = fullName.normalize("NFC").replace(/\s+/g, " ").trim().split(" ");
  const first = words.find((w) => !HONORIFICS.has(w.toLowerCase().replace(/\.$/, "")));
  return first ?? words[0] ?? fullName;
}

/** What an admin or a bulk row supplies for an offer letter. */
export const offerInputSchema = z
  .object({
    offerType: z.enum(OFFER_TYPES, { message: "Choose Internship or Campus Ambassador" }),
    role: text(80).pipe(z.string().min(2, "Enter the role")),
    institution: optionalText(120),
    startDate: isoDate,
    durationCount: z.coerce.number().int("Duration must be a whole number").min(1, "Duration must be at least 1").max(104, "Duration is too long"),
    durationUnit: z.enum(DURATION_UNITS, { message: "Duration unit must be weeks or months" }),
    mode: z.enum(INTERNSHIP_MODES, { message: "Choose Remote, On-site or Hybrid" }),
    /** Rupees as typed; stored in paise. Blank = no stipend printed. */
    stipendRupees: z
      .union([z.number(), z.string()])
      .nullish()
      .transform((v, ctx) => {
        if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
        const n = typeof v === "number" ? v : Number(v.trim().replace(/[,₹\s]/g, ""));
        if (!Number.isFinite(n) || n <= 0 || n > 10_000_000 || Math.round(n * 100) !== n * 100) {
          ctx.addIssue({ code: "custom", message: "Stipend must be a positive amount in rupees" });
          return z.NEVER;
        }
        return n;
      }),
    stipendPeriod: z
      .union([z.enum(STIPEND_PERIODS), z.literal("")])
      .nullish()
      .transform((v) => (v ? v : null)),
    greetingName: optionalText(60),
  })
  .superRefine((d, ctx) => {
    const start = parseISODate(d.startDate);
    if (!start) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Start date is not a real date" });
    else if (start.getUTCFullYear() < 2020) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Start date is implausibly early" });
    if (d.durationUnit === "MONTHS" && d.durationCount > 24) ctx.addIssue({ code: "custom", path: ["durationCount"], message: "Duration is too long" });
    if (d.stipendRupees !== null && !d.stipendPeriod) ctx.addIssue({ code: "custom", path: ["stipendPeriod"], message: "Say whether the stipend is per month or in total" });
  });
export type OfferInput = z.input<typeof offerInputSchema>;

/** Snapshot on the credential: inputs plus the resolved greeting and printable labels. */
export type OfferDetails = {
  offerType: OfferType;
  role: string;
  institution: string | null;
  startDate: string;
  duration: { count: number; unit: (typeof DURATION_UNITS)[number]; label: string };
  mode: InternshipMode;
  stipend: { amountPaise: number; period: StipendPeriod; label: string } | null;
  greetingName: string;
};

/** "INR 5,000": the letter font has no ₹ glyph, and INR is unambiguous on a formal letter. */
const inr = (paise: number) =>
  `INR ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(paise / 100)}`;

export function buildOfferDetails(input: OfferInput, fullName: string): OfferDetails {
  const d = offerInputSchema.parse(input);
  const unit = d.durationUnit === "MONTHS" ? "Month" : "Week";
  const stipend =
    d.stipendRupees === null
      ? null
      : (() => {
          const amountPaise = Math.round(d.stipendRupees * 100);
          const period = d.stipendPeriod as StipendPeriod;
          return { amountPaise, period, label: `${inr(amountPaise)}${period === "PER_MONTH" ? " per month" : " (total)"}` };
        })();
  return {
    offerType: d.offerType,
    role: d.role,
    institution: d.institution,
    startDate: d.startDate,
    duration: { count: d.durationCount, unit: d.durationUnit, label: `${d.durationCount} ${unit}${d.durationCount === 1 ? "" : "s"}` },
    mode: d.mode,
    stipend,
    greetingName: d.greetingName ?? greetingName(fullName),
  };
}

export const storedOfferDetailsSchema = z.object({
  offerType: z.enum(OFFER_TYPES),
  role: z.string(),
  institution: z.string().nullable(),
  startDate: isoDate,
  duration: z.object({ count: z.number(), unit: z.enum(DURATION_UNITS), label: z.string() }),
  mode: z.enum(INTERNSHIP_MODES),
  stipend: z.object({ amountPaise: z.number(), period: z.enum(STIPEND_PERIODS), label: z.string() }).nullable(),
  greetingName: z.string(),
});

/** Back to form input (reissue corrections). */
export function offerDetailsToInput(d: OfferDetails): OfferInput {
  return {
    offerType: d.offerType,
    role: d.role,
    institution: d.institution,
    startDate: d.startDate,
    durationCount: d.duration.count,
    durationUnit: d.duration.unit,
    mode: d.mode,
    stipendRupees: d.stipend ? d.stipend.amountPaise / 100 : null,
    stipendPeriod: d.stipend?.period ?? null,
    greetingName: d.greetingName,
  };
}

/** Public allowlist for an offer letter: stipend, institution, mode, duration and greeting stay private. */
export type PublicOfferDetails = { offerType: string; role: string; startDate: string };

export function publicOfferDetails(details: unknown): PublicOfferDetails | null {
  const parsed = storedOfferDetailsSchema.safeParse(details);
  if (!parsed.success) return null;
  return { offerType: OFFER_TYPE_LABELS[parsed.data.offerType], role: parsed.data.role, startDate: parsed.data.startDate };
}

/** Same recipient + offer type + role + start date = the same offer. */
export function offerDedupeContext(d: Pick<OfferDetails, "offerType" | "role" | "startDate">): string {
  const role = d.role.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  return `o:${d.offerType}:${d.startDate}:${role}`;
}

type TypeDefinition = {
  /** Admin-facing name. */
  label: string;
  /** Shown on the public verification page and in the email. */
  publicLabel: string;
  /** Email/verification wording: "completed the MedTech Immersion Program". */
  verb: string;
};

export const CREDENTIAL_TYPE_DEFINITIONS: Record<CredentialType, TypeDefinition> = {
  COURSE_COMPLETION: { label: "Course completion", publicLabel: "Course Completion Certificate", verb: "completed" },
  INTERNSHIP_COMPLETION: { label: "Internship completion", publicLabel: "Internship Completion Certificate", verb: "completed an internship in" },
  OFFER_LETTER: { label: "Offer letter", publicLabel: "Offer Letter", verb: "was offered" },
};

export function credentialTypeLabel(type: CredentialType): string {
  return CREDENTIAL_TYPE_DEFINITIONS[type].label;
}

/**
 * The duplicate context for an internship: the same learner, program, title and
 * dates is the same internship. Normalised so case and spacing can't create a
 * second live certificate for one internship.
 */
export function internshipDedupeContext(d: Pick<InternshipDetails, "internshipTitle" | "startDate" | "endDate">): string {
  const title = d.internshipTitle.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  return `i:${d.startDate}:${d.endDate}:${title}`;
}

/** An internship completes on its end date. */
export function internshipCompletionDate(d: Pick<InternshipDetails, "endDate">): Date {
  return parseISODate(d.endDate)!;
}

export { toISODate };
