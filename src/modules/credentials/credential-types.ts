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

export const CREDENTIAL_TYPES = ["COURSE_COMPLETION", "INTERNSHIP_COMPLETION"] as const;
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
