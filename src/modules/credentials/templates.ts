import "server-only";
import type { Prisma, StaffUser } from "@/src/generated/prisma/client";
import { CredentialError, uniqueViolation } from "./errors";
import { defaultDeps, type CredentialDeps } from "./service";
import { sha256Hex, templateAssetKey } from "./storage";
import { stampPreview } from "./render";
import {
  backgroundSchema,
  DEV_TEMPLATE_BACKGROUND,
  DEV_INTERNSHIP_TEMPLATE_FIELD_CONFIG,
  DEV_TEMPLATE_FIELD_CONFIG,
  missingRequiredFields,
  fieldConfigSchema,
  parseTemplateSpec,
  signaturesSchema,
} from "./template-config";
import { renderCertificate } from "./render";
import { verificationUrl } from "./config";
import { generateCertificateId } from "./identifiers";

/**
 * Template versions. DRAFT templates are editable; activating one freezes it
 * (DB trigger) and retires the program's previously active version. Issued
 * credentials keep pointing at the version that rendered them.
 */

async function audit(deps: CredentialDeps, actor: StaffUser, action: string, entityId: string, after?: unknown, before?: unknown) {
  await deps.db.auditLog.create({
    data: {
      actor_id: actor.id,
      action,
      entity_type: "certificate_template",
      entity_id: entityId,
      after: (after ?? undefined) as Prisma.InputJsonValue | undefined,
      before: (before ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

async function nextVersion(deps: CredentialDeps, courseId: string) {
  const last = await deps.db.certificateTemplate.findFirst({ where: { course_id: courseId }, orderBy: { version: "desc" } });
  return (last?.version ?? 0) + 1;
}

/** A clearly watermarked, NON-PRODUCTION template so the pipeline works before final artwork exists. */
export async function createDevTemplate(courseId: string, actor: StaffUser, deps: CredentialDeps = defaultDeps()) {
  const course = await deps.db.course.findUnique({ where: { id: courseId } });
  if (!course) throw new CredentialError("Program not found.", "NOT_FOUND");
  for (let i = 0; i < 3; i++) {
    try {
      const t = await deps.db.certificateTemplate.create({
        data: {
          course_id: courseId,
          version: await nextVersion(deps, courseId),
          name: "Development template (non-production)",
          status: "DRAFT",
          is_production: false,
          background: DEV_TEMPLATE_BACKGROUND,
          field_config: course.credential_type === "INTERNSHIP_COMPLETION" ? DEV_INTERNSHIP_TEMPLATE_FIELD_CONFIG : DEV_TEMPLATE_FIELD_CONFIG,
          signatures: [],
          notes: "Watermarked specimen for building and testing. Cannot issue on production.",
          created_by_id: actor.id,
        },
      });
      await audit(deps, actor, "TEMPLATE_CREATED", t.id, { version: t.version, kind: "builtin-dev" });
      return t;
    } catch (e) {
      if (uniqueViolation(e) === "certificate_templates_course_id_version_key") continue;
      throw e;
    }
  }
  throw new CredentialError("Could not allocate a template version. Try again.", "CONFLICT");
}

const ASSET_TYPES: Record<string, { ext: string; max: number }> = {
  "application/pdf": { ext: "pdf", max: 10 * 1024 * 1024 },
  "image/png": { ext: "png", max: 10 * 1024 * 1024 },
  "image/jpeg": { ext: "jpg", max: 10 * 1024 * 1024 },
  "font/ttf": { ext: "ttf", max: 5 * 1024 * 1024 },
  "font/otf": { ext: "otf", max: 5 * 1024 * 1024 },
};

function sniff(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return "font/ttf";
  if (b[0] === 0x4f && b[1] === 0x54 && b[2] === 0x54 && b[3] === 0x4f) return "font/otf";
  return null;
}

/**
 * Store an artwork/signature/font file for templates. The type is decided by
 * the file's magic bytes, not its name or the browser's claim.
 */
export async function uploadTemplateAsset(bytes: Uint8Array, actor: StaffUser, deps: CredentialDeps = defaultDeps()) {
  const mime = sniff(bytes);
  const type = mime ? ASSET_TYPES[mime] : undefined;
  if (!mime || !type) throw new CredentialError("Unsupported file. Use PDF, PNG, JPEG, TTF or OTF.", "VALIDATION");
  if (bytes.byteLength > type.max) throw new CredentialError("File is too large.", "VALIDATION");
  const sha256 = sha256Hex(bytes);
  const path = templateAssetKey(sha256, type.ext);
  await deps.storage.put(path, bytes, mime);
  await deps.db.auditLog.create({
    data: { actor_id: actor.id, action: "TEMPLATE_ASSET_UPLOADED", entity_type: "template_asset", entity_id: sha256, after: { path, mime, bytes: bytes.byteLength } },
  });
  return { path, sha256, mime };
}

/** Create a DRAFT template version from explicit configuration (validated). */
export async function createTemplateVersion(
  input: { courseId: string; name: string; isProduction: boolean; background: unknown; fieldConfig: unknown; signatures: unknown; notes?: string },
  actor: StaffUser,
  deps: CredentialDeps = defaultDeps(),
) {
  const background = backgroundSchema.parse(input.background);
  const fieldConfig = fieldConfigSchema.parse(input.fieldConfig);
  const signatures = signaturesSchema.parse(input.signatures ?? []);
  if (input.isProduction && background.kind === "builtin-dev") {
    throw new CredentialError("The development artwork cannot be marked as production.", "VALIDATION");
  }
  const t = await deps.db.certificateTemplate.create({
    data: {
      course_id: input.courseId,
      version: await nextVersion(deps, input.courseId),
      name: input.name.trim().slice(0, 120) || "Certificate template",
      status: "DRAFT",
      is_production: input.isProduction,
      background,
      field_config: fieldConfig,
      signatures,
      notes: input.notes?.slice(0, 1000),
      created_by_id: actor.id,
    },
  });
  await audit(deps, actor, "TEMPLATE_CREATED", t.id, { version: t.version, is_production: t.is_production });
  return t;
}

/** Render a watermark-free preview with sample data (not stored, not a credential). */
export async function previewTemplate(templateId: string, deps: CredentialDeps = defaultDeps()) {
  const t = await deps.db.certificateTemplate.findUnique({ where: { id: templateId }, include: { course: true } });
  if (!t) throw new CredentialError("Template not found.", "NOT_FOUND");
  const spec = parseTemplateSpec(t);
  const out = await renderCertificate(
    spec,
    {
      learnerName: "Dr. Aanya Venkataraman-Krishnaswamy",
      programName: t.course.certificate_title?.trim() || t.course.name,
      completionDate: new Date("2026-07-15T00:00:00Z"),
      issueDate: new Date("2026-09-25T00:00:00Z"),
      expiresOn: t.course.validity_months ? new Date("2028-07-15T00:00:00Z") : null,
      certificateId: generateCertificateId({ programCode: t.course.code ?? "PREV", year: 2026 }),
      verifyUrl: verificationUrl("PREVIEWxxxxxxxxxxxxxxx"),
      // Long sample values so the preview shows the worst case fitting.
      internship:
        t.course.credential_type === "INTERNSHIP_COMPLETION"
          ? {
              title: "Clinical Research and Regulatory Affairs Intern",
              department: "Clinical Operations & Pharmacovigilance",
              startDate: new Date("2026-06-01T00:00:00Z"),
              endDate: new Date("2026-08-31T00:00:00Z"),
              duration: "3 Months",
              totalHours: 480,
            }
          : undefined,
    },
    (p) => deps.storage.get(p),
  );
  return stampPreview(out.bytes, "TEMPLATE PREVIEW - SAMPLE DATA");
}

export async function activateTemplate(templateId: string, actor: StaffUser, deps: CredentialDeps = defaultDeps()) {
  return deps.db.$transaction(async (tx) => {
    const t = await tx.certificateTemplate.findUnique({ where: { id: templateId } });
    if (!t) throw new CredentialError("Template not found.", "NOT_FOUND");
    if (t.status !== "DRAFT") throw new CredentialError("Only a draft template can be activated.", "NOT_ALLOWED");
    const spec = parseTemplateSpec(t); // refuse to activate an invalid configuration
    const course = await tx.course.findUniqueOrThrow({ where: { id: t.course_id }, select: { credential_type: true } });
    const missing = missingRequiredFields(course.credential_type, spec.fieldConfig);
    if (missing.length) {
      throw new CredentialError(
        `This template can't issue ${course.credential_type === "INTERNSHIP_COMPLETION" ? "internship" : "course"} certificates: it has no ${missing.join(", ")}.`,
        "VALIDATION",
      );
    }
    const previous = await tx.certificateTemplate.findFirst({ where: { course_id: t.course_id, status: "ACTIVE" } });
    if (previous) {
      await tx.certificateTemplate.update({ where: { id: previous.id }, data: { status: "RETIRED", retired_at: new Date() } });
    }
    const updated = await tx.certificateTemplate.update({ where: { id: t.id }, data: { status: "ACTIVE", activated_at: new Date() } });
    await tx.auditLog.create({
      data: {
        actor_id: actor.id,
        action: "TEMPLATE_ACTIVATED",
        entity_type: "certificate_template",
        entity_id: t.id,
        after: { version: t.version, retired_previous: previous?.id ?? null },
      },
    });
    return updated;
  });
}

export async function retireTemplate(templateId: string, actor: StaffUser, deps: CredentialDeps = defaultDeps()) {
  const t = await deps.db.certificateTemplate.findUnique({ where: { id: templateId } });
  if (!t) throw new CredentialError("Template not found.", "NOT_FOUND");
  if (t.status !== "ACTIVE") throw new CredentialError("Only an active template can be retired.", "NOT_ALLOWED");
  const updated = await deps.db.certificateTemplate.update({ where: { id: t.id }, data: { status: "RETIRED", retired_at: new Date() } });
  await audit(deps, actor, "TEMPLATE_RETIRED", t.id, { version: t.version });
  return updated;
}
