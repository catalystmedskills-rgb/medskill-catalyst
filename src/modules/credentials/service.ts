import "server-only";
import { z } from "zod";
import { db as defaultDb } from "@/src/lib/db";
import { sendEmail, type SendEmailResult } from "@/src/lib/email";
import type { Prisma, PrismaClient, StaffUser, Credential } from "@/src/generated/prisma/client";
import {
  allowNonProductionTemplates,
  certificateDownloadUrl,
  emailMode,
  RESEND_LIMIT_PER_HOUR,
  verificationUrl,
} from "./config";
import { indianDate, indianYear, parseISODate } from "./dates";
import { completionContext, dedupeKey } from "./dedupe";
import { credentialEmail } from "./email";
import { CredentialError, uniqueViolation } from "./errors";
import { generateCertificateId, generateVerificationToken } from "./identifiers";
import {
  buildInternshipDetails,
  CREDENTIAL_TYPE_DEFINITIONS,
  credentialTypeSchema,
  internshipDedupeContext,
  storedInternshipDetailsSchema,
  buildOfferDetails,
  INTERNSHIP_MODE_LABELS,
  offerDedupeContext,
  offerDetailsToInput,
  storedOfferDetailsSchema,
  type OfferDetails,
  type CredentialType,
  type InternshipDetails,
} from "./credential-types";
import { preflightCertificate, RenderError, renderCertificate, stampPreview, type CertificateData } from "./render";
import { computeExpiresAt } from "./status";
import { certificatePdfKey, credentialStorage, type CredentialStorage } from "./storage";
import { parseTemplateSpec } from "./template-config";

/**
 * Credential lifecycle service. Pages, server actions, API routes and bulk
 * jobs all go through here; authorization happens in the caller (via
 * requirePermission) and the actor is passed in.
 *
 * Issuance is a small state machine (see docs/credentials/ARCHITECTURE.md):
 *
 *   insert ISSUING ─► render PDF ─► store PDF ─► VALID ─► email
 *                          │
 *                          └─► FAILED (hidden publicly, retryable)
 *
 * The record is not publicly verifiable until the PDF exists (a correction of
 * PRD §4.1 step order, approved 2026-09-25). Email is sent only after VALID and
 * its failure never affects the credential.
 */

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

export type Mailer = (msg: { to: string; subject: string; html: string }) => Promise<SendEmailResult>;

export type CredentialDeps = {
  db: Db;
  storage: CredentialStorage;
  mailer: Mailer;
  now: () => Date;
};

export function defaultDeps(): CredentialDeps {
  return { db: defaultDb, storage: credentialStorage(), mailer: sendEmail, now: () => new Date() };
}

const LEASE_MS = 2 * 60 * 1000;

// ── Input ─────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const issueInputSchema = z.object({
  fullName: z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(2, "Enter the learner's full name").max(120, "Name is too long")),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  courseId: z.string().min(1, "Choose a program"),
  batchId: z.string().min(1).nullable().optional(),
  /** Course completions only. An internship completes on its end date. */
  completionDate: isoDate.optional(),
  /** What the admin chose first; must match the program's type. */
  credentialType: credentialTypeSchema.optional(),
  /** INTERNSHIP_COMPLETION details, validated by the type registry in planIssue. */
  internship: z.unknown().optional(),
  /** OFFER_LETTER details, validated by the type registry in planIssue. */
  offer: z.unknown().optional(),
  templateId: z.string().uuid().optional(),
  sendEmail: z.boolean().default(true),
  /** Client-generated per form submission / bulk row. Retries reuse it. */
  idempotencyKey: z.string().regex(/^[A-Za-z0-9:_-]{16,120}$/, "Invalid idempotency key"),
});
export type IssueInput = z.input<typeof issueInputSchema>;

export type IssuePlan = {
  course: { id: string; name: string; code: string; validity_months: number | null; validity_anchor: string; title: string };
  batch: { id: string; name: string } | null;
  template: { id: string; version: number; name: string; is_production: boolean };
  learner: { existingStudentId: string | null; existingName: string | null };
  completionDate: Date;
  issueDate: Date;
  expiresAt: Date | null;
  credentialType: CredentialType;
  /** Snapshot stored in credentials.details: {} for course completions. */
  details: InternshipDetails | OfferDetails | Record<string, never>;
  internship: InternshipDetails | null;
  offer: OfferDetails | null;
  /** The type's duplicate identity (internships: title + dates), else null. */
  typeContext: string | null;
  dedupe: { key: string | null; existingCertificateId: string | null; existingCredentialId: string | null };
  warnings: string[];
};

// ── Helpers ───────────────────────────────────────────────────────

export async function recordEvent(
  tx: Tx | Db,
  credentialId: string,
  type: Prisma.CredentialEventCreateManyInput["type"],
  actorId: string | null,
  metadata: Record<string, unknown> = {},
) {
  await tx.credentialEvent.create({
    data: { credential_id: credentialId, type, actor_id: actorId, metadata: metadata as Prisma.InputJsonValue },
  });
}

/** Stored error text: bounded and free of anything that looks like a secret or connection string. */
function safeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/postgres(ql)?:\/\/\S+/gi, "[redacted-url]").replace(/(key|token|secret)=\S+/gi, "$1=[redacted]").slice(0, 500);
}

async function resolveTemplate(d: Db | Tx, courseId: string, templateId?: string) {
  const template = templateId
    ? await d.certificateTemplate.findUnique({ where: { id: templateId } })
    : await d.certificateTemplate.findFirst({ where: { course_id: courseId, status: "ACTIVE" } });
  if (!template || template.course_id !== courseId) {
    throw new CredentialError("This program has no active certificate template. Activate one under Templates.", "CONFIG");
  }
  if (template.status !== "ACTIVE") {
    throw new CredentialError("That certificate template is not active; new credentials can't use it.", "CONFIG");
  }
  if (!template.is_production && !allowNonProductionTemplates()) {
    throw new CredentialError("The development template cannot issue credentials on production.", "CONFIG");
  }
  return template;
}

async function findStudentByEmail(d: Db | Tx, email: string) {
  return d.student.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
}

function assetLoader(storage: CredentialStorage) {
  return (path: string) => storage.get(path);
}

// ── Credential types ──────────────────────────────────────────────

/** Validate internship input through the type registry; registry errors become field-level validation errors. */
function parseInternship(raw: unknown): InternshipDetails {
  if (!raw || typeof raw !== "object") throw new CredentialError("Enter the internship details.", "VALIDATION");
  try {
    return buildInternshipDetails(raw as Parameters<typeof buildInternshipDetails>[0]);
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new CredentialError(e.issues.map((i) => i.message).join("; "), "VALIDATION", { fields: e.issues.map((i) => i.path.join(".")) });
    }
    throw e;
  }
}

function parseOffer(raw: unknown, fullName: string): OfferDetails {
  if (!raw || typeof raw !== "object") throw new CredentialError("Enter the offer details.", "VALIDATION");
  try {
    return buildOfferDetails(raw as Parameters<typeof buildOfferDetails>[0], fullName);
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new CredentialError(e.issues.map((i) => i.message).join("; "), "VALIDATION", { fields: e.issues.map((i) => i.path.join(".")) });
    }
    throw e;
  }
}

function storedOffer(c: Pick<Credential, "credential_type" | "details">): OfferDetails | null {
  if (c.credential_type !== "OFFER_LETTER") return null;
  return storedOfferDetailsSchema.parse(c.details);
}

const MODE_INTERNSHIP: Record<string, string> = { REMOTE: "a virtual", ON_SITE: "an on-site", HYBRID: "a hybrid" };

export function offerRenderData(d: OfferDetails | null): CertificateData["offer"] {
  if (!d) return undefined;
  return {
    offerType: d.offerType,
    role: d.role,
    institution: d.institution,
    startDate: parseISODate(d.startDate)!,
    duration: d.duration.label,
    mode: INTERNSHIP_MODE_LABELS[d.mode],
    modeInternship: MODE_INTERNSHIP[d.mode],
    stipend: d.stipend?.label ?? null,
    greetingName: d.greetingName,
  };
}

function storedInternship(c: Pick<Credential, "credential_type" | "details">): InternshipDetails | null {
  if (c.credential_type !== "INTERNSHIP_COMPLETION") return null;
  return storedInternshipDetailsSchema.parse(c.details);
}

function typeContextOf(internship: InternshipDetails | null, offer: OfferDetails | null = null): string | null {
  if (internship) return internshipDedupeContext(internship);
  if (offer) return offerDedupeContext(offer);
  return null;
}

function internshipRenderData(d: InternshipDetails | null): CertificateData["internship"] {
  if (!d) return undefined;
  return {
    title: d.internshipTitle,
    department: d.department,
    startDate: parseISODate(d.startDate)!,
    endDate: parseISODate(d.endDate)!,
    duration: d.duration.label,
    totalHours: d.totalHours,
  };
}

/** Everything printed comes from the credential's frozen snapshot, never from current program data. */
function certificateDataOf(c: Credential): CertificateData {
  return {
    learnerName: c.learner_name,
    programName: c.program_name,
    completionDate: c.completion_date,
    issueDate: indianDate(c.issued_at),
    expiresOn: c.expires_at,
    certificateId: c.certificate_id,
    verifyUrl: verificationUrl(c.verification_token),
    internship: internshipRenderData(storedInternship(c)),
    offer: offerRenderData(storedOffer(c)),
  };
}

function typeLabel(t: CredentialType) {
  return CREDENTIAL_TYPE_DEFINITIONS[t].label.toLowerCase();
}

// ── Plan (validation + duplicate detection, no writes) ────────────

/**
 * Everything issuance would do, checked without writing: program/cohort/
 * template, dates, the duplicate rule and whether every field fits on the
 * certificate. Used by the "review" step of single issue and by bulk validation.
 */
export async function planIssue(input: z.output<typeof issueInputSchema>, deps: CredentialDeps): Promise<IssuePlan> {
  const { db, now } = deps;
  const course = await db.course.findUnique({ where: { id: input.courseId } });
  if (!course) throw new CredentialError("Program not found.", "NOT_FOUND");
  if (!course.is_active) throw new CredentialError("This program is inactive.", "CONFIG");
  if (!course.code) throw new CredentialError("This program has no program code yet. Set one under Programs.", "CONFIG");

  let batch: { id: string; name: string } | null = null;
  if (input.batchId) {
    const b = await db.batch.findUnique({ where: { id: input.batchId } });
    if (!b || b.course_id !== course.id) throw new CredentialError("That cohort does not belong to this program.", "VALIDATION");
    batch = { id: b.id, name: b.name };
  }

  const template = await resolveTemplate(db, course.id, input.templateId);

  const credentialType = course.credential_type as CredentialType;
  if (input.credentialType && input.credentialType !== credentialType) {
    throw new CredentialError(`This program issues ${typeLabel(credentialType)} certificates, not ${typeLabel(input.credentialType)}.`, "VALIDATION");
  }
  const internship = credentialType === "INTERNSHIP_COMPLETION" ? parseInternship(input.internship) : null;
  const offer = credentialType === "OFFER_LETTER" ? parseOffer(input.offer, input.fullName) : null;
  const typeContext = typeContextOf(internship, offer);

  if (!internship && !offer && !input.completionDate) throw new CredentialError("Enter the completion date.", "VALIDATION");
  // An offer letter is dated the day it is issued; its start date may be in the future.
  const completionDate = internship
    ? parseISODate(internship.endDate)
    : offer
      ? indianDate(now())
      : parseISODate(input.completionDate!);
  if (!completionDate) throw new CredentialError("Completion date is not a real date.", "VALIDATION");
  const today = indianDate(now());
  if (completionDate.getTime() > today.getTime()) {
    throw new CredentialError(internship ? "The internship end date is in the future." : "Completion date is in the future.", "VALIDATION");
  }
  if (completionDate.getUTCFullYear() < 2020) throw new CredentialError("Completion date is implausibly early.", "VALIDATION");

  const issueDate = today;
  const expiresAt = computeExpiresAt({
    validityMonths: course.validity_months,
    anchor: course.validity_anchor,
    completionDate,
    issueDate,
  });

  const student = await findStudentByEmail(db, input.email);
  const warnings: string[] = [];
  if (student && student.full_name.trim().toLowerCase() !== input.fullName.toLowerCase()) {
    warnings.push(`This email belongs to an existing learner named "${student.full_name}". The certificate will show "${input.fullName}".`);
  }
  if (!template.is_production) warnings.push("Using a NON-PRODUCTION development template (watermarked specimen).");

  let dedupe: IssuePlan["dedupe"] = { key: null, existingCertificateId: null, existingCredentialId: null };
  if (student) {
    const key = dedupeKey({ studentId: student.id, courseId: course.id, batchId: batch?.id ?? null, completionDate, typeContext });
    const existing = await db.credential.findFirst({
      where: { dedupe_key: key, status: { in: ["ISSUING", "VALID"] } },
      select: { id: true, certificate_id: true },
    });
    dedupe = { key, existingCertificateId: existing?.certificate_id ?? null, existingCredentialId: existing?.id ?? null };
  }

  const title = course.certificate_title?.trim() || course.name;
  const spec = parseTemplateSpec(template);
  const sample: CertificateData = {
    learnerName: input.fullName,
    programName: title,
    completionDate,
    issueDate,
    expiresOn: expiresAt,
    certificateId: generateCertificateId({ programCode: course.code, year: indianYear(now()) }),
    verifyUrl: verificationUrl("x".repeat(22)),
    internship: internshipRenderData(internship),
    offer: offerRenderData(offer),
  };
  if (offer && !spec.fieldConfig.copy?.[offer.offerType]) {
    throw new CredentialError("This program's active template has no wording for this offer type. Upload an offer letter template version.", "CONFIG");
  }
  if (internship && !spec.fieldConfig.fields.internship_title) {
    throw new CredentialError("This program's active template has no internship name field (internship_title). Upload an internship template version.", "CONFIG");
  }
  const issues = await preflightCertificate(spec, sample, assetLoader(deps.storage));
  if (issues.length) {
    throw new CredentialError(
      issues.map((i) => `${i.field === "learner_name" ? "Name" : i.field === "program_name" ? "Program title" : i.field}: ${i.message}`).join("; "),
      "RENDER",
      { issues },
    );
  }

  return {
    course: { id: course.id, name: course.name, code: course.code, validity_months: course.validity_months, validity_anchor: course.validity_anchor, title },
    batch,
    template: { id: template.id, version: template.version, name: template.name, is_production: template.is_production },
    learner: { existingStudentId: student?.id ?? null, existingName: student?.full_name ?? null },
    completionDate,
    issueDate,
    expiresAt,
    credentialType,
    details: internship ?? offer ?? {},
    internship,
    offer,
    typeContext,
    dedupe,
    warnings,
  };
}

/**
 * "Certificate preview" in the issue workflow: the exact certificate that
 * would be issued, with a sample ID, stamped PREVIEW. Writes nothing.
 */
export async function previewIssue(raw: IssueInput, deps: CredentialDeps = defaultDeps()): Promise<Uint8Array> {
  const input = issueInputSchema.parse(raw);
  const plan = await planIssue(input, deps);
  const template = await deps.db.certificateTemplate.findUniqueOrThrow({ where: { id: plan.template.id } });
  const out = await renderCertificate(
    parseTemplateSpec(template),
    {
      learnerName: input.fullName,
      programName: plan.course.title,
      completionDate: plan.completionDate,
      issueDate: plan.issueDate,
      expiresOn: plan.expiresAt,
      certificateId: generateCertificateId({ programCode: plan.course.code, year: plan.issueDate.getUTCFullYear() }),
      verifyUrl: verificationUrl("PREVIEWxxxxxxxxxxxxxxx"),
      internship: internshipRenderData(plan.internship),
      offer: offerRenderData(plan.offer),
    },
    assetLoader(deps.storage),
  );
  return stampPreview(out.bytes);
}

// ── Issue ─────────────────────────────────────────────────────────

export type IssueResult = {
  credential: Credential;
  /** false when an earlier request with the same idempotency key already did the work */
  created: boolean;
  email: { status: "SENT" | "FAILED" | "SUPPRESSED" | "SKIPPED"; error?: string } | null;
};

export async function issueCredential(
  raw: IssueInput,
  actor: StaffUser,
  deps: CredentialDeps = defaultDeps(),
  opts: { source?: "SINGLE" | "BULK" } = {},
): Promise<IssueResult> {
  const input = issueInputSchema.parse(raw);
  const { db } = deps;

  // Idempotency: the same key always resolves to the same credential.
  const prior = await db.credential.findUnique({ where: { idempotency_key: input.idempotencyKey } });
  if (prior) return resumeExisting(prior, input, actor, deps);

  const plan = await planIssue(input, deps);
  if (plan.dedupe.existingCertificateId) {
    // A concurrent request with the SAME key may have just created the row we
    // collided with: that is our own submission, not a duplicate.
    const mine = await db.credential.findUnique({ where: { idempotency_key: input.idempotencyKey } });
    if (mine) return resumeExisting(mine, input, actor, deps);
    const scope = plan.internship
      ? " for this internship (same title and dates)"
      : plan.offer
        ? " for this offer (same offer type, role and start date)"
        : `for this program${plan.batch ? " and cohort" : " and completion date"}`;
    throw new CredentialError(
      `This learner already has an active credential ${scope.trim()} (${plan.dedupe.existingCertificateId}). Use Reissue to correct it.`,
      "DUPLICATE",
      { certificateId: plan.dedupe.existingCertificateId, credentialId: plan.dedupe.existingCredentialId },
    );
  }

  let credential: Credential | null = null;
  for (let attempt = 0; attempt < 6 && !credential; attempt++) {
    try {
      credential = await db.$transaction(async (tx) => {
        const student =
          (await findStudentByEmail(tx, input.email)) ??
          (await tx.student.create({ data: { full_name: input.fullName, email: input.email } }));
        const key = dedupeKey({ studentId: student.id, courseId: plan.course.id, batchId: plan.batch?.id ?? null, completionDate: plan.completionDate, typeContext: plan.typeContext });
        const c = await tx.credential.create({
          data: {
            certificate_id: generateCertificateId({ programCode: plan.course.code, year: plan.issueDate.getUTCFullYear() }),
            verification_token: generateVerificationToken(),
            idempotency_key: input.idempotencyKey,
            student_id: student.id,
            course_id: plan.course.id,
            batch_id: plan.batch?.id ?? null,
            template_id: plan.template.id,
            learner_name: input.fullName,
            program_name: plan.course.title,
            completion_date: plan.completionDate,
            completion_context: plan.typeContext ?? completionContext(plan.batch?.id ?? null, plan.completionDate),
            credential_type: plan.credentialType,
            details: plan.details as Prisma.InputJsonValue,
            issued_at: deps.now(),
            expires_at: plan.expiresAt,
            status: "ISSUING",
            dedupe_key: key,
            source: opts.source ?? "SINGLE",
            created_by_id: actor.id,
          },
        });
        await recordEvent(tx, c.id, "ISSUE_REQUESTED", actor.id, {
          credential_type: plan.credentialType,
          template_version: plan.template.version,
          send_email: input.sendEmail,
          source: opts.source ?? "SINGLE",
        });
        return c;
      });
    } catch (e) {
      const which = uniqueViolation(e);
      if (which === "credentials_certificate_id_key" || which === "credentials_verification_token_key") continue; // regenerate
      if (which === "credentials_idempotency_key_key") {
        const existing = await db.credential.findUniqueOrThrow({ where: { idempotency_key: input.idempotencyKey } });
        return resumeExisting(existing, input, actor, deps);
      }
      if (which === "credentials_dedupe_active_key") {
        const mine = await db.credential.findUnique({ where: { idempotency_key: input.idempotencyKey } });
        if (mine) return resumeExisting(mine, input, actor, deps);
        throw new CredentialError("This learner already has an active credential for this program and cohort. Use Reissue to correct it.", "DUPLICATE");
      }
      if (which === "students_email_key") continue; // concurrent learner creation; the retry finds the row
      throw e;
    }
  }
  if (!credential) throw new CredentialError("Could not allocate a unique certificate ID. Try again.", "CONFLICT");

  const finalized = await renderAndFinalize(credential.id, actor, deps);
  const email = input.sendEmail && finalized.status === "VALID" ? await deliverCredentialEmail(finalized.id, "ISSUED", actor, deps) : null;
  return { credential: finalized, created: true, email };
}

async function resumeExisting(prior: Credential, input: z.output<typeof issueInputSchema>, actor: StaffUser, deps: CredentialDeps): Promise<IssueResult> {
  const student = await deps.db.student.findUnique({ where: { id: prior.student_id } });
  if (prior.course_id !== input.courseId || student?.email.toLowerCase() !== input.email) {
    throw new CredentialError("This request key was already used for a different credential.", "CONFLICT");
  }
  if (prior.status === "ISSUING" || prior.status === "FAILED") {
    const finalized = await renderAndFinalize(prior.id, actor, deps);
    const alreadyEmailed = await deps.db.credentialEmailDelivery.count({ where: { credential_id: prior.id, kind: "ISSUED" } });
    const email =
      input.sendEmail && finalized.status === "VALID" && alreadyEmailed === 0
        ? await deliverCredentialEmail(finalized.id, "ISSUED", actor, deps)
        : null;
    return { credential: finalized, created: false, email };
  }
  return { credential: prior, created: false, email: null };
}

/**
 * Render → store → VALID. Guarded by a short lease so concurrent retries of the
 * same credential never render twice at once. Safe to call repeatedly.
 */
export async function renderAndFinalize(credentialId: string, actor: StaffUser, deps: CredentialDeps): Promise<Credential> {
  const { db, storage } = deps;
  const now = deps.now();
  const claimed = await db.credential.updateMany({
    where: {
      id: credentialId,
      status: { in: ["ISSUING", "FAILED"] },
      OR: [{ lease_until: null }, { lease_until: { lt: now } }],
    },
    data: { status: "ISSUING", lease_until: new Date(now.getTime() + LEASE_MS), render_attempts: { increment: 1 } },
  });
  const current = await db.credential.findUniqueOrThrow({ where: { id: credentialId } });
  if (claimed.count === 0) {
    if (current.status === "ISSUING") throw new CredentialError("This credential is being generated right now. Refresh in a moment.", "IN_PROGRESS");
    return current;
  }

  let pdf: { path: string; sha256: string };
  try {
    const template = await db.certificateTemplate.findUniqueOrThrow({ where: { id: current.template_id } });
    const spec = parseTemplateSpec(template);
    const out = await renderCertificate(spec, certificateDataOf(current), assetLoader(storage));
    const path = certificatePdfKey(current.id, out.sha256);
    await storage.put(path, out.bytes, "application/pdf");
    pdf = { path, sha256: out.sha256 };
  } catch (e) {
    const message = e instanceof RenderError ? e.message : safeError(e);
    console.error("[credentials] render/store failed", credentialId, e);
    await db.$transaction(async (tx) => {
      await tx.credential.update({ where: { id: credentialId }, data: { status: "FAILED", lease_until: null, last_error: message } });
      await recordEvent(tx, credentialId, "RENDER_FAILED", actor.id, { error: message });
    });
    return db.credential.findUniqueOrThrow({ where: { id: credentialId } });
  }

  try {
    return await db.$transaction(async (tx) => {
      // Reissue: the replacement becomes live in the same transaction that
      // retires its predecessor, so there is never a moment with two live
      // credentials or with none.
      let dedupe = current.dedupe_key;
      if (current.supersedes_id) {
        const parent = await tx.credential.findUniqueOrThrow({ where: { id: current.supersedes_id } });
        if (parent.status === "VALID") {
          await tx.credential.update({ where: { id: parent.id }, data: { status: "SUPERSEDED" } });
          await recordEvent(tx, parent.id, "SUPERSEDED", actor.id, { superseded_by: current.certificate_id });
        }
        dedupe = dedupeKey({
          studentId: current.student_id,
          courseId: current.course_id,
          batchId: current.batch_id,
          completionDate: current.completion_date,
          typeContext: typeContextOf(storedInternship(current), storedOffer(current)),
        });
      }
      const done = await tx.credential.update({
        where: { id: credentialId },
        data: { status: "VALID", pdf_path: pdf.path, pdf_sha256: pdf.sha256, lease_until: null, last_error: null, dedupe_key: dedupe },
      });
      await recordEvent(tx, credentialId, "PDF_GENERATED", actor.id, { sha256: pdf.sha256 });
      if (current.supersedes_id) {
        const parent = await tx.credential.findUniqueOrThrow({ where: { id: current.supersedes_id }, select: { certificate_id: true } });
        await recordEvent(tx, credentialId, "REISSUED", actor.id, { supersedes: parent.certificate_id });
      }
      await recordEvent(tx, credentialId, "ISSUED", actor.id, {});
      return done;
    });
  } catch (e) {
    const which = uniqueViolation(e);
    const message =
      which === "credentials_dedupe_active_key"
        ? "Another active credential already exists for this learner, program and cohort."
        : safeError(e);
    await db.$transaction(async (tx) => {
      await tx.credential.update({ where: { id: credentialId }, data: { status: "FAILED", lease_until: null, last_error: message } });
      await recordEvent(tx, credentialId, "RENDER_FAILED", actor.id, { error: message, stage: "finalize" });
    });
    return db.credential.findUniqueOrThrow({ where: { id: credentialId } });
  }
}

/** Admin "retry" for a FAILED credential. */
export async function retryCredential(credentialId: string, actor: StaffUser, deps: CredentialDeps = defaultDeps()) {
  const c = await deps.db.credential.findUnique({ where: { id: credentialId } });
  if (!c) throw new CredentialError("Credential not found.", "NOT_FOUND");
  if (c.status !== "FAILED" && c.status !== "ISSUING") throw new CredentialError("Only failed credentials can be retried.", "NOT_ALLOWED");
  const done = await renderAndFinalize(credentialId, actor, deps);
  if (done.status === "VALID") {
    const sent = await deps.db.credentialEmailDelivery.count({ where: { credential_id: done.id, kind: "ISSUED" } });
    const requested = await deps.db.credentialEvent.findFirst({ where: { credential_id: done.id, type: "ISSUE_REQUESTED" } });
    const wantsEmail = (requested?.metadata as { send_email?: boolean } | null)?.send_email !== false;
    if (sent === 0 && wantsEmail) await deliverCredentialEmail(done.id, "ISSUED", actor, deps);
  }
  return done;
}

// ── Email ─────────────────────────────────────────────────────────

/**
 * Send (or suppress, per CREDENTIAL_EMAIL_MODE) the learner email and record
 * the delivery. Never throws for a delivery failure: the credential stays
 * VALID and the failure is visible to admins with a resend action.
 */
export async function deliverCredentialEmail(
  credentialId: string,
  kind: "ISSUED" | "RESEND",
  actor: StaffUser,
  deps: CredentialDeps,
): Promise<NonNullable<IssueResult["email"]>> {
  const { db } = deps;
  const c = await db.credential.findUniqueOrThrow({ where: { id: credentialId }, include: { student: true } });
  if (c.status !== "VALID") throw new CredentialError("Only a valid credential can be emailed.", "NOT_ALLOWED");
  const mode = emailMode();
  const recipient = mode.mode === "redirect" ? mode.redirectTo! : c.student.email;
  const delivery = await db.credentialEmailDelivery.create({
    data: { credential_id: c.id, kind, recipient, status: "PENDING", triggered_by_id: actor.id },
  });

  if (mode.mode === "off") {
    await db.credentialEmailDelivery.update({
      where: { id: delivery.id },
      data: { status: "SUPPRESSED", last_error: mode.note ?? "CREDENTIAL_EMAIL_MODE=off" },
    });
    await recordEvent(db, c.id, "EMAIL_SUPPRESSED", actor.id, { delivery_id: delivery.id, kind, reason: mode.note ?? "email mode off" });
    return { status: "SUPPRESSED" };
  }

  const msg = credentialEmail({
    learnerName: c.learner_name,
    programName: c.program_name,
    certificateId: c.certificate_id,
    completionDate: c.completion_date,
    verifyUrl: verificationUrl(c.verification_token),
    downloadUrl: certificateDownloadUrl(c.verification_token),
    isResend: kind === "RESEND",
    internship: (() => {
      const i = internshipRenderData(storedInternship(c));
      return i ? { title: i.title, startDate: i.startDate, endDate: i.endDate, duration: i.duration } : null;
    })(),
    offer: (() => {
      const o = offerRenderData(storedOffer(c));
      return o ? { role: o.role, startDate: o.startDate, offerType: o.offerType } : null;
    })(),
  });
  let result: SendEmailResult;
  try {
    result = await deps.mailer({ to: recipient, subject: msg.subject, html: msg.html });
  } catch (e) {
    result = { ok: false, reason: safeError(e) };
  }
  await db.credentialEmailDelivery.update({
    where: { id: delivery.id },
    data: {
      status: result.ok ? "SENT" : "FAILED",
      provider_message_id: result.id ?? null,
      attempts: { increment: 1 },
      last_attempt_at: deps.now(),
      last_error: result.ok ? null : (result.reason ?? "unknown").slice(0, 300),
    },
  });
  await recordEvent(db, c.id, result.ok ? "EMAIL_SENT" : "EMAIL_FAILED", actor.id, {
    delivery_id: delivery.id,
    kind,
    mode: mode.mode,
    ...(result.ok ? {} : { error: (result.reason ?? "unknown").slice(0, 300) }),
  });
  return result.ok ? { status: "SENT" } : { status: "FAILED", error: result.reason };
}

export async function resendCredential(credentialId: string, actor: StaffUser, deps: CredentialDeps = defaultDeps()) {
  const { db } = deps;
  const c = await db.credential.findUnique({ where: { id: credentialId } });
  if (!c) throw new CredentialError("Credential not found.", "NOT_FOUND");
  if (c.status !== "VALID") throw new CredentialError("Only a valid credential can be resent.", "NOT_ALLOWED");
  const since = new Date(deps.now().getTime() - 60 * 60 * 1000);
  const recent = await db.credentialEmailDelivery.count({ where: { credential_id: c.id, kind: "RESEND", created_at: { gte: since } } });
  if (recent >= RESEND_LIMIT_PER_HOUR) {
    throw new CredentialError("This credential was resent several times in the last hour. Try again later.", "RATE_LIMITED");
  }
  await recordEvent(db, c.id, "EMAIL_RESENT", actor.id, {});
  return deliverCredentialEmail(c.id, "RESEND", actor, deps);
}

// ── Revoke ────────────────────────────────────────────────────────

export const revokeSchema = z.object({
  reason: z.string().trim().min(5, "Give an internal reason (at least 5 characters)").max(1000),
});

export async function revokeCredential(credentialId: string, rawReason: string, actor: StaffUser, deps: CredentialDeps = defaultDeps()) {
  const { reason } = revokeSchema.parse({ reason: rawReason });
  return deps.db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ status: string }[]>`SELECT "status"::text FROM "public"."credentials" WHERE "id" = ${credentialId}::uuid FOR UPDATE`;
    if (!locked[0]) throw new CredentialError("Credential not found.", "NOT_FOUND");
    if (locked[0].status !== "VALID") throw new CredentialError(`A ${locked[0].status.toLowerCase()} credential cannot be revoked.`, "NOT_ALLOWED");
    const updated = await tx.credential.update({
      where: { id: credentialId },
      data: { status: "REVOKED", revoked_at: deps.now(), revoked_by_id: actor.id, revocation_reason: reason },
    });
    await recordEvent(tx, credentialId, "REVOKED", actor.id, { reason });
    return updated;
  });
}

// ── Reissue ───────────────────────────────────────────────────────

export const reissueSchema = z.object({
  fullName: z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(2).max(120))
    .optional(),
  completionDate: isoDate.optional(),
  /** Internship corrections. Omitted fields keep the original's values; the duration is recomputed. */
  internship: z.record(z.string(), z.unknown()).optional(),
  /** Offer letter corrections (a revised offer). Omitted fields keep the original's values. */
  offer: z.record(z.string(), z.unknown()).optional(),
  batchId: z.string().min(1).nullable().optional(),
  templateId: z.string().uuid().optional(),
  reason: z.string().trim().min(5, "Give a reason for the reissue (at least 5 characters)").max(1000),
  sendEmail: z.boolean().default(true),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9:_-]{16,120}$/),
});
export type ReissueInput = z.input<typeof reissueSchema>;

/**
 * A reissue creates a NEW credential (new certificate ID, new token) linked to
 * the old one. If the old one is VALID it becomes SUPERSEDED at the moment the
 * new one becomes VALID; a REVOKED original stays REVOKED. The old verification
 * page keeps resolving and shows its current state.
 */
export async function reissueCredential(parentId: string, raw: ReissueInput, actor: StaffUser, deps: CredentialDeps = defaultDeps()): Promise<IssueResult> {
  const input = reissueSchema.parse(raw);
  const { db } = deps;

  const prior = await db.credential.findUnique({ where: { idempotency_key: input.idempotencyKey } });
  if (prior) {
    if (prior.supersedes_id !== parentId) throw new CredentialError("This request key was already used for a different credential.", "CONFLICT");
    const done = prior.status === "ISSUING" || prior.status === "FAILED" ? await renderAndFinalize(prior.id, actor, deps) : prior;
    return { credential: done, created: false, email: null };
  }

  const parent = await db.credential.findUnique({ where: { id: parentId }, include: { superseded_by: { select: { id: true, status: true } }, course: true } });
  if (!parent) throw new CredentialError("Credential not found.", "NOT_FOUND");
  if (parent.status !== "VALID" && parent.status !== "REVOKED") {
    throw new CredentialError(`A ${parent.status.toLowerCase()} credential cannot be reissued.`, "NOT_ALLOWED");
  }
  if (parent.superseded_by) {
    throw new CredentialError("A replacement for this credential already exists.", "CONFLICT", { credentialId: parent.superseded_by.id });
  }

  const batchId = input.batchId === undefined ? parent.batch_id : input.batchId;
  if (batchId) {
    const b = await db.batch.findUnique({ where: { id: batchId } });
    if (!b || b.course_id !== parent.course_id) throw new CredentialError("That cohort does not belong to this program.", "VALIDATION");
  }
  const template = await resolveTemplate(db, parent.course_id, input.templateId);
  const original = storedInternship(parent);
  let internship: InternshipDetails | null = null;
  if (original) {
    const { duration: _computed, ...base } = original;
    void _computed;
    internship = parseInternship({ ...base, ...(input.internship ?? {}) });
  }
  const originalOffer = storedOffer(parent);
  const offer = originalOffer
    ? parseOffer({ ...offerDetailsToInput(originalOffer), ...(input.offer ?? {}) }, input.fullName ?? parent.learner_name)
    : null;
  const typeContext = typeContextOf(internship, offer);
  const completionDate = internship
    ? parseISODate(internship.endDate)
    : offer
      ? indianDate(deps.now())
      : input.completionDate
      ? parseISODate(input.completionDate)
      : parent.completion_date;
  if (!completionDate) throw new CredentialError("Completion date is not a real date.", "VALIDATION");
  if (completionDate.getTime() > indianDate(deps.now()).getTime()) throw new CredentialError("Completion date is in the future.", "VALIDATION");
  if (!parent.course.code) throw new CredentialError("This program has no program code.", "CONFIG");

  const learnerName = input.fullName ?? parent.learner_name;
  const issueDate = indianDate(deps.now());
  const expiresAt = computeExpiresAt({
    validityMonths: parent.course.validity_months,
    anchor: parent.course.validity_anchor,
    completionDate,
    issueDate,
  });
  const programName = parent.course.certificate_title?.trim() || parent.course.name;

  const issues = await preflightCertificate(
    parseTemplateSpec(template),
    {
      learnerName,
      programName,
      completionDate,
      issueDate,
      expiresOn: expiresAt,
      certificateId: generateCertificateId({ programCode: parent.course.code, year: issueDate.getUTCFullYear() }),
      verifyUrl: verificationUrl("x".repeat(22)),
      internship: internshipRenderData(internship),
      offer: offerRenderData(offer),
    },
    assetLoader(deps.storage),
  );
  if (issues.length) throw new CredentialError(issues.map((i) => `${i.field}: ${i.message}`).join("; "), "RENDER", { issues });

  let child: Credential | null = null;
  for (let attempt = 0; attempt < 6 && !child; attempt++) {
    try {
      child = await db.$transaction(async (tx) => {
        const c = await tx.credential.create({
          data: {
            certificate_id: generateCertificateId({ programCode: parent.course.code!, year: issueDate.getUTCFullYear() }),
            verification_token: generateVerificationToken(),
            idempotency_key: input.idempotencyKey,
            student_id: parent.student_id,
            course_id: parent.course_id,
            batch_id: batchId,
            template_id: template.id,
            learner_name: learnerName,
            program_name: programName,
            completion_date: completionDate,
            completion_context: typeContext ?? completionContext(batchId, completionDate),
            credential_type: parent.credential_type,
            details: (internship ?? offer ?? {}) as Prisma.InputJsonValue,
            issued_at: deps.now(),
            expires_at: expiresAt,
            status: "ISSUING",
            dedupe_key: null, // set at finalize, after the predecessor is retired
            source: "REISSUE",
            supersedes_id: parent.id,
            created_by_id: actor.id,
          },
        });
        await recordEvent(tx, c.id, "ISSUE_REQUESTED", actor.id, {
          credential_type: parent.credential_type,
          reissue_of: parent.certificate_id,
          reason: input.reason,
          template_version: template.version,
          send_email: input.sendEmail,
          source: "REISSUE",
        });
        return c;
      });
    } catch (e) {
      const which = uniqueViolation(e);
      if (which === "credentials_certificate_id_key" || which === "credentials_verification_token_key") continue;
      if (which === "credentials_supersedes_id_key") throw new CredentialError("A replacement for this credential already exists.", "CONFLICT");
      if (which === "credentials_idempotency_key_key") {
        const existing = await db.credential.findUniqueOrThrow({ where: { idempotency_key: input.idempotencyKey } });
        return { credential: existing, created: false, email: null };
      }
      throw e;
    }
  }
  if (!child) throw new CredentialError("Could not allocate a unique certificate ID. Try again.", "CONFLICT");

  const done = await renderAndFinalize(child.id, actor, deps);
  const email = input.sendEmail && done.status === "VALID" ? await deliverCredentialEmail(done.id, "ISSUED", actor, deps) : null;
  return { credential: done, created: true, email };
}
