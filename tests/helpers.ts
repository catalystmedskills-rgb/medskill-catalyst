import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { db } from "@/src/lib/db";
import type { StaffRole } from "@/src/generated/prisma/enums";
import { LocalStorage } from "@/src/modules/credentials/storage";
import type { CredentialDeps, Mailer } from "@/src/modules/credentials/service";
import { activateTemplate, createDevTemplate } from "@/src/modules/credentials/templates";

export { db };

export const storage = new LocalStorage(path.join(os.tmpdir(), `msc-cred-test-${process.pid}`));

export function deps(overrides: Partial<CredentialDeps> = {}): CredentialDeps {
  const sent: Parameters<Mailer>[0][] = [];
  return {
    db,
    storage,
    mailer: async (m) => {
      sent.push(m);
      return { ok: true, id: `msg_${sent.length}` };
    },
    now: () => new Date(),
    ...overrides,
  };
}

export const key = () => `test-${randomUUID()}`;

let n = 0;
export async function staff(role: StaffRole, extra: { clerk_user_id?: string; is_active?: boolean } = {}) {
  n++;
  return db.staffUser.create({
    data: {
      clerk_user_id: extra.clerk_user_id ?? `user_${randomUUID()}`,
      name: `${role} ${n}`,
      email: `${role.toLowerCase()}${n}-${randomUUID().slice(0, 6)}@staff.test`,
      role,
      is_active: extra.is_active ?? true,
    },
  });
}

/** A program with a code, a cohort and an ACTIVE development template. */
export async function program(opts: { code?: string; validityMonths?: number | null; anchor?: string; credentialType?: "COURSE_COMPLETION" | "INTERNSHIP_COMPLETION" } = {}) {
  const admin = await staff("ADMIN");
  const code = opts.code ?? `T${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const course = await db.course.create({
    data: {
      name: `Test Program ${code}`,
      slug: `test-${code.toLowerCase()}-${randomUUID().slice(0, 4)}`,
      base_price_paise: 100,
      code,
      validity_months: opts.validityMonths ?? null,
      validity_anchor: opts.anchor ?? "COMPLETION",
      credential_type: opts.credentialType ?? "COURSE_COMPLETION",
    },
  });
  const batch = await db.batch.create({ data: { course_id: course.id, name: "Cohort A" } });
  const batch2 = await db.batch.create({ data: { course_id: course.id, name: "Cohort B" } });
  const t = await createDevTemplate(course.id, admin, deps());
  const template = await activateTemplate(t.id, admin, deps());
  return { course, batch, batch2, template, admin };
}

export function issueInput(p: { course: { id: string }; batch?: { id: string } | null }, over: Record<string, unknown> = {}) {
  return {
    fullName: "Priya Raman",
    email: `learner-${randomUUID().slice(0, 8)}@example.test`,
    courseId: p.course.id,
    batchId: p.batch?.id ?? null,
    completionDate: "2026-07-15",
    sendEmail: true,
    idempotencyKey: key(),
    ...over,
  };
}
