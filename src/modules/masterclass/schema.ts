import { z } from "zod";

/**
 * Masterclass registration validation.
 *
 * Free of `server-only` and Prisma on purpose: the same field rules run in the
 * browser for instant feedback and on the server as the real gate, so the two
 * can never disagree. Only the server result is trusted.
 */

export const ACADEMIC_STATUSES = ["FIRST_YEAR", "SECOND_YEAR", "THIRD_YEAR", "GRADUATE"] as const;
export type AcademicStatusValue = (typeof ACADEMIC_STATUSES)[number];

export const ACADEMIC_STATUS_OPTIONS: { value: AcademicStatusValue; label: string }[] = [
  { value: "FIRST_YEAR", label: "First Year" },
  { value: "SECOND_YEAR", label: "Second Year" },
  { value: "THIRD_YEAR", label: "Third Year" },
  { value: "GRADUATE", label: "Pass-out / Graduate" },
];

export const ACADEMIC_STATUS_LABELS: Record<AcademicStatusValue, string> = Object.fromEntries(
  ACADEMIC_STATUS_OPTIONS.map((o) => [o.value, o.label]),
) as Record<AcademicStatusValue, string>;

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

export const universityField = z
  .string({ error: "Please enter your university." })
  .transform(collapse)
  .pipe(
    z
      .string()
      .min(2, "Please enter your university.")
      .max(200, "University name is too long."),
  );

/** The fields the student fills in. Shared by the form and the API. */
export const registrationFieldsSchema = z.object({
  fullName: fullNameField,
  email: emailField,
  phone: phoneField,
  university: universityField,
  universitySource: z.enum(["directory", "manual"]).default("manual"),
  academicStatus: z.enum(ACADEMIC_STATUSES, { error: "Please choose your current academic status." }),
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
