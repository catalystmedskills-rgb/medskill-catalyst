import { z } from "zod";

/**
 * Certificate template configuration. A template = background artwork +
 * positioned boxes for each dynamic field + a QR box + signature blocks.
 * Coordinates are PDF points (1/72 in) from the page's bottom-left corner.
 *
 * Nothing here is specific to one design: the final approved artwork becomes
 * a new template version with its own boxes. Issued credentials keep the
 * template version they were rendered with (credentials.template_id), and an
 * activated template is frozen by a database trigger.
 */

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const STANDARD_FONTS = [
  "Helvetica",
  "Helvetica-Bold",
  "Helvetica-Oblique",
  "Times-Roman",
  "Times-Bold",
  "Times-Italic",
  "Courier",
  "Courier-Bold",
] as const;

const assetRef = z.object({
  path: z.string().min(1).max(300),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const fontRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("standard"), name: z.enum(STANDARD_FONTS) }),
  // A TrueType/OpenType font uploaded with the template (needed for full
  // Unicode names and brand typefaces). Embedded as a subset.
  z.object({ kind: z.literal("asset"), ...assetRef.shape }),
]);
export type FontRef = z.infer<typeof fontRefSchema>;

export const textBoxSchema = z
  .object({
    x: z.number().min(0),
    y: z.number().min(0),
    width: z.number().positive(),
    height: z.number().positive(),
    font: fontRefSchema,
    size: z.number().min(4).max(120),
    /** Fit rule: shrink toward minSize, then wrap up to maxLines; beyond that issuance is blocked. */
    minSize: z.number().min(4).max(120),
    maxLines: z.number().int().min(1).max(8).default(1),
    lineHeight: z.number().min(0.9).max(2).default(1.15),
    align: z.enum(["left", "center", "right"]).default("left"),
    color: hex.default("#0A2A43"),
    /** Static text printed before the value, e.g. "Completed on ". */
    prefix: z.string().max(80).default(""),
    /** Prefix in its own style ("Ref: " grey regular before a navy semibold value). */
    prefixFont: fontRefSchema.optional(),
    prefixColor: hex.optional(),
    /** Letters (paragraphs): **bold** spans in the text are set in this font. */
    boldFont: fontRefSchema.optional(),
    /** Letter-spacing in em (single-line labels such as "INTERNSHIP OFFER"). */
    tracking: z.number().min(0).max(0.5).default(0),
    /** Paragraphs read from the top of their box; labels centre. */
    valign: z.enum(["center", "top"]).default("center"),
    /** Dates: "15 July 2026" (certificates) or "15/07/2026" (letters). */
    dateStyle: z.enum(["long", "dmy"]).default("long"),
  })
  .refine((b) => b.minSize <= b.size, { message: "minSize must be ≤ size" });
export type TextBox = z.infer<typeof textBoxSchema>;

export const FIELD_KEYS = [
  "learner_name",
  "program_name",
  "completion_date",
  "issue_date",
  "expiry_date",
  "certificate_id",
  "verify_url",
  // Internship completion (credential type INTERNSHIP_COMPLETION).
  "internship_title",
  "department",
  "start_date",
  "end_date",
  "internship_period",
  "duration",
  "total_hours",
  // Offer letters (credential type OFFER_LETTER). Copy keys read the template's
  // per-offer-type wording; the rest are the letter's own details.
  "offer_eyebrow",
  "offer_salutation",
  "offer_opening",
  "offer_body",
  "offer_expect_1",
  "offer_expect_2",
  "offer_expect_3",
  "offer_closing",
  "offer_signoff",
  "recipient_institution",
  "offer_role",
  "offer_duration",
  "offer_mode",
  "offer_start_date",
  "offer_stipend_label",
  "offer_stipend",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

const copyText = z.string().min(1).max(700);
export const OFFER_COPY_KEYS = ["eyebrow", "opening", "body", "expect1", "expect2", "expect3", "closing", "signoff"] as const;
export const offerCopySchema = z.object({
  eyebrow: copyText,
  opening: copyText,
  body: copyText,
  expect1: copyText,
  expect2: copyText,
  expect3: copyText,
  closing: copyText,
  signoff: copyText,
});
export type OfferCopy = z.infer<typeof offerCopySchema>;

export const qrBoxSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  /** Includes the 4-module quiet zone. ≥ 57pt ≈ 2 cm so print copies still scan. */
  size: z.number().min(57).max(300),
  errorCorrection: z.enum(["M", "Q", "H"]).default("M"),
  color: hex.default("#0A2A43"),
});

export const fieldConfigSchema = z.object({
  page: z.object({ width: z.number().positive().max(2000), height: z.number().positive().max(2000) }),
  fields: z
    .object({
      learner_name: textBoxSchema,
      /** Required for course completions (missingRequiredFields); optional for internships, whose ribbon names the type. */
      program_name: textBoxSchema.optional(),
      /** Required for course completions (missingRequiredFields); an internship prints its period instead. */
      completion_date: textBoxSchema.optional(),
      issue_date: textBoxSchema.optional(),
      expiry_date: textBoxSchema.optional(),
      certificate_id: textBoxSchema,
      verify_url: textBoxSchema.optional(),
      internship_title: textBoxSchema.optional(),
      department: textBoxSchema.optional(),
      start_date: textBoxSchema.optional(),
      end_date: textBoxSchema.optional(),
      /** "1 June 2026 – 31 August 2026" in one box. */
      internship_period: textBoxSchema.optional(),
      duration: textBoxSchema.optional(),
      /** Printed only when total hours were supplied. */
      total_hours: textBoxSchema.optional(),
      offer_eyebrow: textBoxSchema.optional(),
      offer_salutation: textBoxSchema.optional(),
      offer_opening: textBoxSchema.optional(),
      offer_body: textBoxSchema.optional(),
      offer_expect_1: textBoxSchema.optional(),
      offer_expect_2: textBoxSchema.optional(),
      offer_expect_3: textBoxSchema.optional(),
      offer_closing: textBoxSchema.optional(),
      offer_signoff: textBoxSchema.optional(),
      recipient_institution: textBoxSchema.optional(),
      offer_role: textBoxSchema.optional(),
      offer_duration: textBoxSchema.optional(),
      offer_mode: textBoxSchema.optional(),
      offer_start_date: textBoxSchema.optional(),
      /** Printed only when the letter has a stipend. */
      offer_stipend_label: textBoxSchema.optional(),
      offer_stipend: textBoxSchema.optional(),
    })
    .strict(),
  qr: qrBoxSchema,
  /**
   * Letter wording per offer type (offer letters only). Placeholders: {firstName},
   * {role}, {institution}, {modeInternship} ("a virtual" / "an on-site" / "a hybrid"),
   * {atInstitution} (" at <institution>" or ""). **bold** spans need the box's boldFont.
   * Wording is part of the template version: changing it means a new, reviewed version.
   */
  copy: z.record(z.string(), offerCopySchema).optional(),
});
export type FieldConfig = z.infer<typeof fieldConfigSchema>;

export const signatureSchema = z.object({
  label: z.string().max(80),
  image: z.object({ ...assetRef.shape, mime: z.enum(["image/png", "image/jpeg"]) }),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
  name: z.object({ text: z.string().max(120), box: textBoxSchema }).optional(),
  title: z.object({ text: z.string().max(160), box: textBoxSchema }).optional(),
});
export const signaturesSchema = z.array(signatureSchema).max(4);
export type SignatureBlock = z.infer<typeof signatureSchema>;

export const backgroundSchema = z.discriminatedUnion("kind", [
  /** Programmatic, clearly watermarked development artwork. Never for production. */
  z.object({ kind: z.literal("builtin-dev") }),
  /** Approved artwork: a one-page PDF (preferred, vector) or a high-resolution PNG/JPEG. */
  z.object({ kind: z.literal("storage"), ...assetRef.shape, mime: z.enum(["application/pdf", "image/png", "image/jpeg"]) }),
]);
export type Background = z.infer<typeof backgroundSchema>;

export type TemplateSpec = {
  background: Background;
  fieldConfig: FieldConfig;
  signatures: SignatureBlock[];
};

export function parseTemplateSpec(t: { background: unknown; field_config: unknown; signatures: unknown }): TemplateSpec {
  return {
    background: backgroundSchema.parse(t.background),
    fieldConfig: fieldConfigSchema.parse(t.field_config),
    signatures: signaturesSchema.parse(t.signatures ?? []),
  };
}

// ── Development template (NON-PRODUCTION) ─────────────────────────
// A4 landscape. Deliberately not the approved design: it exists so the whole
// pipeline can be built and tested while the final artwork is pending.
const std = (name: (typeof STANDARD_FONTS)[number]) => ({ kind: "standard" as const, name });

export const DEV_TEMPLATE_FIELD_CONFIG: FieldConfig = fieldConfigSchema.parse({
  page: { width: 842, height: 595 },
  fields: {
    learner_name: { x: 70, y: 300, width: 520, height: 64, font: std("Times-Bold"), size: 40, minSize: 20, maxLines: 2, lineHeight: 1.1, align: "left", color: "#0A2A43" },
    program_name: { x: 70, y: 222, width: 520, height: 44, font: std("Helvetica-Bold"), size: 20, minSize: 12, maxLines: 2, align: "left", color: "#0F1B27" },
    completion_date: { x: 70, y: 192, width: 520, height: 18, font: std("Helvetica"), size: 11, minSize: 9, align: "left", color: "#5A6B7B", prefix: "Completed on " },
    issue_date: { x: 70, y: 174, width: 520, height: 18, font: std("Helvetica"), size: 11, minSize: 9, align: "left", color: "#5A6B7B", prefix: "Issued on " },
    expiry_date: { x: 70, y: 156, width: 520, height: 18, font: std("Helvetica"), size: 11, minSize: 9, align: "left", color: "#5A6B7B", prefix: "Valid until " },
    certificate_id: { x: 560, y: 64, width: 150, height: 14, font: std("Courier-Bold"), size: 9, minSize: 7, align: "right", color: "#0A2A43", prefix: "ID  " },
    verify_url: { x: 440, y: 80, width: 270, height: 12, font: std("Helvetica"), size: 7, minSize: 5, align: "right", color: "#00589E" },
  },
  qr: { x: 718, y: 50, size: 76, errorCorrection: "M", color: "#0A2A43" },
});

/** Development layout for INTERNSHIP_COMPLETION programs, until the approved internship artwork exists. */
export const DEV_INTERNSHIP_TEMPLATE_FIELD_CONFIG: FieldConfig = fieldConfigSchema.parse({
  page: { width: 842, height: 595 },
  // Laid out around the built-in background's static lines ("Presented to" at
  // y 372, "For successfully completing" at y 272): the internship title takes
  // the course layout's program slot directly under the latter.
  fields: {
    learner_name: { x: 70, y: 300, width: 520, height: 64, font: std("Times-Bold"), size: 40, minSize: 20, maxLines: 2, lineHeight: 1.1, align: "left", color: "#0A2A43" },
    internship_title: { x: 70, y: 226, width: 520, height: 40, font: std("Helvetica-Bold"), size: 18, minSize: 11, maxLines: 2, align: "left", color: "#0F1B27" },
    department: { x: 70, y: 208, width: 520, height: 16, font: std("Helvetica"), size: 11, minSize: 8, align: "left", color: "#5A6B7B", prefix: "Department: " },
    program_name: { x: 70, y: 190, width: 520, height: 16, font: std("Helvetica"), size: 11, minSize: 8, align: "left", color: "#5A6B7B" },
    internship_period: { x: 70, y: 168, width: 520, height: 18, font: std("Helvetica"), size: 11, minSize: 8, align: "left", color: "#0F1B27" },
    duration: { x: 70, y: 150, width: 260, height: 16, font: std("Helvetica-Bold"), size: 11, minSize: 8, align: "left", color: "#0F1B27", prefix: "Duration: " },
    total_hours: { x: 330, y: 150, width: 260, height: 16, font: std("Helvetica"), size: 11, minSize: 8, align: "left", color: "#0F1B27", prefix: "Total: " },
    issue_date: { x: 70, y: 128, width: 520, height: 18, font: std("Helvetica"), size: 11, minSize: 9, align: "left", color: "#5A6B7B", prefix: "Issued on " },
    certificate_id: { x: 560, y: 64, width: 150, height: 14, font: std("Courier-Bold"), size: 9, minSize: 7, align: "right", color: "#0A2A43", prefix: "ID  " },
    verify_url: { x: 440, y: 80, width: 270, height: 12, font: std("Helvetica"), size: 7, minSize: 5, align: "right", color: "#00589E" },
  },
  qr: { x: 718, y: 50, size: 76, errorCorrection: "M", color: "#0A2A43" },
});

/**
 * Fields a template MUST place for a credential type, checked when a template
 * is activated. An internship certificate that doesn't say what the internship
 * was, or when, is not a usable certificate.
 */
export function missingRequiredFields(type: string, config: FieldConfig): string[] {
  const f = config.fields;
  if (type === "OFFER_LETTER") {
    const missing: string[] = [];
    for (const k of ["learner_name", "offer_opening", "offer_role", "offer_start_date", "certificate_id", "issue_date"] as const) {
      if (!f[k]) missing.push(k.replace(/_/g, " "));
    }
    for (const offerType of ["INTERNSHIP", "CAMPUS_AMBASSADOR"]) {
      if (!config.copy?.[offerType]) missing.push(`wording for ${offerType.toLowerCase().replace("_", " ")} offers`);
    }
    return missing;
  }
  if (type !== "INTERNSHIP_COMPLETION") {
    return [...(f.program_name ? [] : ["program name"]), ...(f.completion_date ? [] : ["completion date"])];
  }
  const missing: string[] = [];
  if (!f.internship_title) missing.push("internship name (internship_title field)");
  if (!f.internship_period && !(f.start_date && f.end_date)) missing.push("internship dates (period, or start and end)");
  if (!f.duration) missing.push("duration");
  return missing;
}

export const DEV_TEMPLATE_BACKGROUND: Background = { kind: "builtin-dev" };
