import { z } from "zod";

/**
 * Masterclass registration validation.
 *
 * Free of `server-only` and Prisma on purpose: the same field rules run in the
 * browser for instant feedback and on the server as the real gate, so the two
 * can never disagree. Only the server result is trusted.
 */

/** What the form offers today: the student's current semester, or graduated. */
export const ACADEMIC_STATUSES = [
  "SEMESTER_1",
  "SEMESTER_2",
  "SEMESTER_3",
  "SEMESTER_4",
  "SEMESTER_5",
  "SEMESTER_6",
  "SEMESTER_7",
  "SEMESTER_8",
  "GRADUATE",
] as const;
export type AcademicStatusValue = (typeof ACADEMIC_STATUSES)[number];

/** Year-based values from the first release. Still stored on early registrations; no longer offered. */
export type LegacyAcademicStatus = "FIRST_YEAR" | "SECOND_YEAR" | "THIRD_YEAR";

const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

export const ACADEMIC_STATUS_OPTIONS: { value: AcademicStatusValue; label: string }[] = [
  ...ORDINAL.map((o, i) => ({ value: `SEMESTER_${i + 1}` as AcademicStatusValue, label: `${o} Semester` })),
  { value: "GRADUATE", label: "Pass-out / Graduate" },
];

export const ACADEMIC_STATUS_LABELS: Record<AcademicStatusValue | LegacyAcademicStatus, string> = {
  ...(Object.fromEntries(ACADEMIC_STATUS_OPTIONS.map((o) => [o.value, o.label])) as Record<AcademicStatusValue, string>),
  FIRST_YEAR: "First Year",
  SECOND_YEAR: "Second Year",
  THIRD_YEAR: "Third Year",
};

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Indian mobile → E.164. Accepts "98765 43210", "+91 98765-43210",
 * "09876543210", "919876543210". Returns null for anything else.
 */
export function normalizeIndianMobile(raw: string): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

export const fullNameField = z
  .string({ error: "Please enter your full name." })
  .transform(collapse)
  .pipe(
    z
      .string()
      .min(2, "Please enter your full name.")
      .max(100, "Name is too long.")
      // Letters from any script, spaces, and the punctuation real names use.
      .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u, "Please use letters only in your name."),
  );

export const emailField = z
  .string({ error: "Please enter your email address." })
  .transform((s) => s.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(1, "Please enter your email address.")
      .max(254, "Email address is too long.")
      .pipe(z.email("Please enter a valid email address.")),
  );

export const phoneField = z
  .string({ error: "Please enter your mobile number." })
  .transform((s, ctx) => {
    const e164 = normalizeIndianMobile(s);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: "Please enter a valid 10-digit Indian mobile number." });
      return z.NEVER;
    }
    return e164;
  });

/** Degree courses offered in the form, grouped for the dropdown. Anything else uses "Other". */
export const COURSE_GROUPS: { label: string; courses: string[] }[] = [
  { label: "Pharmacy", courses: ["B.Pharm", "M.Pharm", "Pharm.D", "D.Pharm"] },
  {
    label: "Life sciences",
    courses: [
      "B.Sc Life Sciences / Biology",
      "M.Sc Life Sciences",
      "B.Sc Microbiology",
      "M.Sc Microbiology",
      "B.Sc Biochemistry",
      "M.Sc Biochemistry",
      "B.Sc Zoology / Botany",
    ],
  },
  {
    label: "Biotechnology & biomedical",
    courses: [
      "B.Sc Biotechnology",
      "M.Sc Biotechnology",
      "B.Tech Biotechnology",
      "M.Tech Biotechnology",
      "B.Tech / B.E. Biomedical Engineering",
      "M.Tech Biomedical Engineering",
    ],
  },
  {
    label: "Healthcare",
    courses: [
      "MBBS",
      "BDS",
      "BAMS / BHMS / BUMS",
      "B.Sc Nursing",
      "BPT (Physiotherapy)",
      "B.Sc Allied Health / Medical Lab Technology",
    ],
  },
  { label: "Postgraduate & other", courses: ["MBA (Pharma / Healthcare)", "PhD"] },
];

export const COURSE_OPTIONS: string[] = COURSE_GROUPS.flatMap((g) => g.courses);

/** The course as saved: a listed course, or what the student typed under "Other". */
export const courseField = z
  .string({ error: "Please choose your course." })
  .transform(collapse)
  .pipe(
    z
      .string()
      .min(2, "Please choose your course.")
      .max(100, "Course name is too long.")
      .regex(/^[\p{L}\p{N}][\p{L}\p{N} .,&/()'’+-]*$/u, "Please use letters and numbers only in the course name."),
  );

export const universityField = z
  .string({ error: "Please enter your college." })
  .transform(collapse)
  .pipe(
    z
      .string()
      .min(2, "Please enter your college.")
      .max(200, "College name is too long."),
  );

/** The fields the student fills in. Shared by the form and the API. */
export const cityField = z
  .string({ error: "Please enter your city." })
  .transform(collapse)
  .pipe(
    z
      .string()
      .min(2, "Please enter your city.")
      .max(60, "City name is too long.")
      .regex(/^[\p{L}][\p{L} .'’-]*$/u, "Please use letters only in the city name."),
  );

/** Why the student is joining. Any combination; at least one. */
export const JOIN_REASONS = ["KNOW_INDUSTRY", "WORK_IN_MEDTECH", "ROLES_OPPORTUNITIES"] as const;
export type JoinReason = (typeof JOIN_REASONS)[number];

export const JOIN_REASON_OPTIONS: { value: JoinReason; label: string }[] = [
  { value: "KNOW_INDUSTRY", label: "To know about medtech as an industry" },
  { value: "WORK_IN_MEDTECH", label: "Interested in working in medtech" },
  { value: "ROLES_OPPORTUNITIES", label: "Understand roles and opportunities in medtech" },
];

export const JOIN_REASON_LABELS = Object.fromEntries(JOIN_REASON_OPTIONS.map((o) => [o.value, o.label])) as Record<
  JoinReason,
  string
>;

export const joinReasonsField = z
  .array(z.enum(JOIN_REASONS), { error: "Please choose at least one reason." })
  .min(1, "Please choose at least one reason.")
  .transform((v) => JOIN_REASONS.filter((r) => v.includes(r)));

export const registrationFieldsSchema = z.object({
  fullName: fullNameField,
  email: emailField,
  phone: phoneField,
  university: universityField,
  universitySource: z.enum(["directory", "manual"]).default("manual"),
  course: courseField,
  courseSource: z.enum(["list", "other"]).default("list"),
  academicStatus: z.enum(ACADEMIC_STATUSES, { error: "Please choose your current academic status." }),
  city: cityField,
  joinReasons: joinReasonsField,
  consent: z.boolean().refine((v) => v === true, {
    message: "Please agree to be contacted about the masterclass.",
  }),
});

const attr = z
  .string()
  .max(300)
  .transform((s) => collapse(s))
  .optional();

export const attributionSchema = z
  .object({
    utm_source: attr,
    utm_medium: attr,
    utm_campaign: attr,
    utm_content: attr,
    utm_term: attr,
    gclid: attr,
    fbclid: attr,
    referrer: attr,
    landing_page: attr,
  })
  .partial()
  .default({});

/** Full API request body. */
export const registrationRequestSchema = registrationFieldsSchema.extend({
  attribution: attributionSchema,
  /** Honeypot. Humans never see it; anything in it marks the request as a bot. */
  website: z.string().max(200).optional(),
  /** Milliseconds between the form rendering and submit (bot heuristic). */
  elapsedMs: z.number().int().nonnegative().max(86_400_000).optional(),
  /** Browser↔server Meta event id for Conversions API de-duplication. */
  fbEventId: z.string().max(80).regex(/^[A-Za-z0-9._-]+$/).optional(),
});

export type RegistrationFields = z.output<typeof registrationFieldsSchema>;
export type RegistrationRequest = z.output<typeof registrationRequestSchema>;
export type Attribution = z.output<typeof attributionSchema>;

/** First word of a name, for greetings. */
export function firstNameOf(fullName: string): string {
  return collapse(fullName).split(" ")[0] || "there";
}

/** "areeb.khan@gmail.com" → "ar•••••••@gmail.com" — enough to recognise, not to harvest. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "your registered email";
  const keep = local.slice(0, Math.min(2, local.length));
  return `${keep}${"•".repeat(Math.max(3, local.length - keep.length))}@${domain}`;
}
