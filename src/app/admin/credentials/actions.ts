"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import { AuthError, requirePermission } from "@/src/lib/auth";
import { Permission } from "@/src/lib/permissions";
import { db } from "@/src/lib/db";
import { CredentialError } from "@/src/modules/credentials/errors";
import {
  defaultDeps,
  issueCredential,
  issueInputSchema,
  planIssue,
  reissueCredential,
  resendCredential,
  retryCredential,
  revokeCredential,
} from "@/src/modules/credentials/service";
import {
  activateTemplate,
  createDevTemplate,
  createTemplateVersion,
  retireTemplate,
  uploadTemplateAsset,
} from "@/src/modules/credentials/templates";
import { isValidProgramCode, normalizeCertificateId } from "@/src/modules/credentials/identifiers";
import { formatLongDate } from "@/src/modules/credentials/dates";

function safeMessage(err: unknown): string {
  if (err instanceof CredentialError || err instanceof AuthError) return err.message;
  if (err instanceof ZodError) return err.issues.map((i) => i.message).join("; ");
  console.error("[credentials action]", err);
  return "Something went wrong. Nothing was issued; please try again.";
}

const back = (path: string, params: Record<string, string>) => {
  const qs = new URLSearchParams(params).toString();
  redirect(`${path}${path.includes("?") ? "&" : "?"}${qs}`);
};

// ── Single issue: review, then confirm ────────────────────────────

export type PlanState =
  | { status: "idle" }
  | { status: "error"; message: string; duplicate?: { certificateId: string; credentialId: string | null } }
  | {
      status: "ready";
      summary: {
        learnerName: string;
        email: string;
        program: string;
        programCode: string;
        cohort: string | null;
        completionDate: string;
        issueDate: string;
        expires: string;
        template: string;
        sendEmail: boolean;
        existingLearner: string | null;
      };
      warnings: string[];
    };

function readIssueForm(formData: FormData) {
  return {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    courseId: String(formData.get("courseId") ?? ""),
    batchId: (formData.get("batchId") as string) || null,
    completionDate: String(formData.get("completionDate") ?? ""),
    sendEmail: formData.get("sendEmail") === "on",
    idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
  };
}

export async function planIssueAction(_prev: PlanState, formData: FormData): Promise<PlanState> {
  try {
    await requirePermission(Permission.CredentialsIssue, { individual: true });
    const input = issueInputSchema.parse(readIssueForm(formData));
    const plan = await planIssue(input, defaultDeps());
    if (plan.dedupe.existingCertificateId) {
      return {
        status: "error",
        message: `Blocked: this learner already has an active credential for this program${plan.batch ? " and cohort" : " and completion date"} (${plan.dedupe.existingCertificateId}). To correct it, open that credential and use Reissue.`,
        duplicate: { certificateId: plan.dedupe.existingCertificateId, credentialId: plan.dedupe.existingCredentialId },
      };
    }
    return {
      status: "ready",
      summary: {
        learnerName: input.fullName,
        email: input.email,
        program: plan.course.title,
        programCode: plan.course.code,
        cohort: plan.batch?.name ?? null,
        completionDate: formatLongDate(plan.completionDate),
        issueDate: formatLongDate(plan.issueDate),
        expires: plan.expiresAt ? formatLongDate(plan.expiresAt) : "Never (lifetime credential)",
        template: `${plan.template.name} · v${plan.template.version}`,
        sendEmail: input.sendEmail,
        existingLearner: plan.learner.existingName,
      },
      warnings: plan.warnings,
    };
  } catch (err) {
    return { status: "error", message: safeMessage(err) };
  }
}

export async function issueAction(formData: FormData): Promise<void> {
  let id: string | null = null;
  try {
    const actor = await requirePermission(Permission.CredentialsIssue, { individual: true });
    const result = await issueCredential(readIssueForm(formData), actor);
    id = result.credential.id;
  } catch (err) {
    const e = err instanceof CredentialError && err.code === "DUPLICATE" ? err : null;
    back("/admin/credentials/issue", { error: safeMessage(err), ...(e?.details?.credentialId ? { dup: String(e.details.credentialId) } : {}) });
  }
  revalidatePath("/admin/credentials");
  redirect(`/admin/credentials/${id}?ok=issued`);
}

// ── Lifecycle actions on one credential ───────────────────────────

const idSchema = z.string().uuid();

export async function resendAction(formData: FormData) {
  const id = idSchema.parse(formData.get("id"));
  let msg = "resent";
  try {
    const actor = await requirePermission(Permission.CredentialsResend, { individual: true });
    const r = await resendCredential(id, actor);
    msg = r.status === "SENT" ? "resent" : r.status === "SUPPRESSED" ? "resend-suppressed" : "resend-failed";
  } catch (err) {
    back(`/admin/credentials/${id}`, { error: safeMessage(err) });
  }
  revalidatePath(`/admin/credentials/${id}`);
  redirect(`/admin/credentials/${id}?ok=${msg}`);
}

export async function retryAction(formData: FormData) {
  const id = idSchema.parse(formData.get("id"));
  try {
    const actor = await requirePermission(Permission.CredentialsIssue, { individual: true });
    await retryCredential(id, actor);
  } catch (err) {
    back(`/admin/credentials/${id}`, { error: safeMessage(err) });
  }
  revalidatePath(`/admin/credentials/${id}`);
  redirect(`/admin/credentials/${id}?ok=retried`);
}

export async function revokeAction(formData: FormData) {
  const id = idSchema.parse(formData.get("id"));
  try {
    const actor = await requirePermission(Permission.CredentialsRevoke, { individual: true });
    const typed = normalizeCertificateId(String(formData.get("confirm") ?? ""));
    if (!typed || typed !== normalizeCertificateId(String(formData.get("certificateId") ?? ""))) {
      throw new CredentialError("Type the certificate ID to confirm revocation.", "VALIDATION");
    }
    await revokeCredential(id, String(formData.get("reason") ?? ""), actor);
  } catch (err) {
    back(`/admin/credentials/${id}`, { error: safeMessage(err), panel: "revoke" });
  }
  revalidatePath(`/admin/credentials/${id}`);
  redirect(`/admin/credentials/${id}?ok=revoked`);
}

export async function reissueAction(formData: FormData) {
  const id = idSchema.parse(formData.get("id"));
  let childId: string | null = null;
  try {
    const actor = await requirePermission(Permission.CredentialsReissue, { individual: true });
    const batchRaw = formData.get("batchId");
    const r = await reissueCredential(
      id,
      {
        fullName: (formData.get("fullName") as string) || undefined,
        completionDate: (formData.get("completionDate") as string) || undefined,
        batchId: batchRaw === "__keep__" ? undefined : (batchRaw as string) || null,
        reason: String(formData.get("reason") ?? ""),
        sendEmail: formData.get("sendEmail") === "on",
        idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      },
      actor,
    );
    childId = r.credential.id;
  } catch (err) {
    back(`/admin/credentials/${id}`, { error: safeMessage(err), panel: "reissue" });
  }
  revalidatePath(`/admin/credentials/${id}`);
  redirect(`/admin/credentials/${childId}?ok=reissued`);
}

// ── Programs & cohorts ────────────────────────────────────────────

export async function updateProgramAction(formData: FormData) {
  const courseId = String(formData.get("courseId") ?? "");
  try {
    const actor = await requirePermission(Permission.ProgramsManage, { individual: true });
    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const validityRaw = String(formData.get("validityMonths") ?? "").trim();
    const anchor = formData.get("validityAnchor") === "ISSUE" ? "ISSUE" : "COMPLETION";
    const title = String(formData.get("certificateTitle") ?? "").trim();
    if (code && !isValidProgramCode(code)) throw new CredentialError("Program code must be 2–10 capital letters or digits.", "VALIDATION");
    const validity = validityRaw === "" ? null : Number(validityRaw);
    if (validity !== null && (!Number.isInteger(validity) || validity < 1 || validity > 600)) {
      throw new CredentialError("Validity must be a whole number of months (1–600), or blank for lifetime.", "VALIDATION");
    }
    const before = await db.course.findUniqueOrThrow({ where: { id: courseId } });
    const clash = code ? await db.course.findFirst({ where: { code, NOT: { id: courseId } } }) : null;
    if (clash) throw new CredentialError(`Code ${code} is already used by ${clash.name}.`, "VALIDATION");
    const after = await db.course.update({
      where: { id: courseId },
      data: { code: code || null, validity_months: validity, validity_anchor: anchor, certificate_title: title || null },
    });
    await db.auditLog.create({
      data: {
        actor_id: actor.id,
        action: "PROGRAM_CREDENTIAL_SETTINGS_UPDATED",
        entity_type: "course",
        entity_id: courseId,
        before: { code: before.code, validity_months: before.validity_months, validity_anchor: before.validity_anchor, certificate_title: before.certificate_title },
        after: { code: after.code, validity_months: after.validity_months, validity_anchor: after.validity_anchor, certificate_title: after.certificate_title },
      },
    });
  } catch (err) {
    back("/admin/credentials/programs", { error: safeMessage(err) });
  }
  revalidatePath("/admin/credentials/programs");
  redirect("/admin/credentials/programs?ok=saved");
}

export async function createCohortAction(formData: FormData) {
  try {
    const actor = await requirePermission(Permission.CohortsManage, { individual: true });
    const input = z
      .object({
        courseId: z.string().min(1),
        name: z.string().trim().min(2).max(120),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
      })
      .parse({
        courseId: formData.get("courseId"),
        name: formData.get("name"),
        startDate: formData.get("startDate") ?? "",
        endDate: formData.get("endDate") ?? "",
      });
    const b = await db.batch.create({
      data: {
        course_id: input.courseId,
        name: input.name,
        start_date: input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : null,
        end_date: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
      },
    });
    await db.auditLog.create({ data: { actor_id: actor.id, action: "COHORT_CREATED", entity_type: "batch", entity_id: b.id, after: { name: b.name, course_id: b.course_id } } });
  } catch (err) {
    back("/admin/credentials/cohorts", { error: safeMessage(err) });
  }
  revalidatePath("/admin/credentials/cohorts");
  redirect("/admin/credentials/cohorts?ok=created");
}

// ── Templates ─────────────────────────────────────────────────────

export async function createDevTemplateAction(formData: FormData) {
  try {
    const actor = await requirePermission(Permission.TemplatesManage, { individual: true });
    await createDevTemplate(String(formData.get("courseId") ?? ""), actor);
  } catch (err) {
    back("/admin/credentials/templates", { error: safeMessage(err) });
  }
  revalidatePath("/admin/credentials/templates");
  redirect("/admin/credentials/templates?ok=created");
}

export async function activateTemplateAction(formData: FormData) {
  try {
    const actor = await requirePermission(Permission.TemplatesManage, { individual: true });
    await activateTemplate(String(formData.get("templateId") ?? ""), actor);
  } catch (err) {
    back("/admin/credentials/templates", { error: safeMessage(err) });
  }
  revalidatePath("/admin/credentials/templates");
  redirect("/admin/credentials/templates?ok=activated");
}

export async function retireTemplateAction(formData: FormData) {
  try {
    const actor = await requirePermission(Permission.TemplatesManage, { individual: true });
    await retireTemplate(String(formData.get("templateId") ?? ""), actor);
  } catch (err) {
    back("/admin/credentials/templates", { error: safeMessage(err) });
  }
  revalidatePath("/admin/credentials/templates");
  redirect("/admin/credentials/templates?ok=retired");
}

/**
 * New template version from approved artwork: background file (PDF/PNG/JPEG),
 * optional fonts/signature images, and the layout JSON (field boxes, QR box,
 * signature blocks). Assets are referenced in the JSON as "asset:<n>" where n
 * is the upload slot; they are replaced with content-addressed storage refs.
 */
export async function uploadTemplateAction(formData: FormData) {
  try {
    const actor = await requirePermission(Permission.TemplatesManage, { individual: true });
    const courseId = String(formData.get("courseId") ?? "");
    const background = formData.get("background");
    if (!(background instanceof File) || background.size === 0) throw new CredentialError("Choose the artwork file.", "VALIDATION");
    const bg = await uploadTemplateAsset(new Uint8Array(await background.arrayBuffer()), actor);
    if (bg.mime.startsWith("font/")) throw new CredentialError("The artwork must be a PDF, PNG or JPEG.", "VALIDATION");

    const assets: Record<string, { path: string; sha256: string; mime: string }> = {};
    for (const slot of ["asset1", "asset2", "asset3", "asset4"]) {
      const f = formData.get(slot);
      if (f instanceof File && f.size > 0) assets[slot] = await uploadTemplateAsset(new Uint8Array(await f.arrayBuffer()), actor);
    }
    let layout: { fieldConfig?: unknown; signatures?: unknown };
    try {
      layout = JSON.parse(String(formData.get("layout") ?? "{}"));
    } catch {
      throw new CredentialError("Layout JSON is not valid JSON.", "VALIDATION");
    }
    const { resolveTemplateAssets } = await import("@/src/modules/credentials/template-assets");
    const resolved = resolveTemplateAssets(layout, assets) as { fieldConfig?: unknown; signatures?: unknown };
    await createTemplateVersion(
      {
        courseId,
        name: String(formData.get("name") ?? ""),
        isProduction: formData.get("isProduction") === "on",
        background: { kind: "storage", path: bg.path, sha256: bg.sha256, mime: bg.mime },
        fieldConfig: resolved.fieldConfig,
        signatures: resolved.signatures ?? [],
        notes: String(formData.get("notes") ?? ""),
      },
      actor,
    );
  } catch (err) {
    back("/admin/credentials/templates", { error: safeMessage(err) });
  }
  revalidatePath("/admin/credentials/templates");
  redirect("/admin/credentials/templates?ok=uploaded");
}
