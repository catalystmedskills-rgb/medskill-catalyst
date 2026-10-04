import "server-only";
import { z } from "zod";
import { db } from "@/src/lib/db";
import type { Prisma } from "@/src/generated/prisma/client";
import { indianDate, parseISODate } from "./dates";
import { derivePublicStatus } from "./status";
import { CREDENTIAL_TYPES, CREDENTIAL_TYPE_DEFINITIONS, type CredentialType } from "./credential-types";

export const listFiltersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  courseId: z.string().max(60).optional(),
  type: z.enum(CREDENTIAL_TYPES).optional(),
  batchId: z.string().max(60).optional(),
  status: z.enum(["VALID", "EXPIRED", "REVOKED", "SUPERSEDED", "ISSUING", "FAILED"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type ListFilters = z.infer<typeof listFiltersSchema>;

export const PAGE_SIZE = 25;

/**
 * Admin credential search. `includePrivate` (credentials.view_private) controls
 * whether learner email is searchable and returned; VIEWERs get neither.
 */
export async function listCredentials(f: ListFilters, includePrivate: boolean) {
  const where: Prisma.CredentialWhereInput = {};
  const and: Prisma.CredentialWhereInput[] = [];
  if (f.q) {
    const q = f.q;
    const or: Prisma.CredentialWhereInput[] = [
      { certificate_id: { contains: q.toUpperCase() } },
      { learner_name: { contains: q, mode: "insensitive" } },
      { details: { path: ["internshipTitle"], string_contains: q } },
    ];
    if (includePrivate) or.push({ student: { email: { contains: q.toLowerCase(), mode: "insensitive" } } });
    and.push({ OR: or });
  }
  if (f.courseId) and.push({ course_id: f.courseId });
  if (f.type) and.push({ credential_type: f.type });
  if (f.batchId) and.push({ batch_id: f.batchId });
  const today = indianDate(new Date());
  if (f.status === "EXPIRED") and.push({ status: "VALID", expires_at: { lte: today } });
  else if (f.status === "VALID") and.push({ status: "VALID", OR: [{ expires_at: null }, { expires_at: { gt: today } }] });
  else if (f.status) and.push({ status: f.status });
  const from = f.from ? parseISODate(f.from) : null;
  const to = f.to ? parseISODate(f.to) : null;
  if (from) and.push({ issued_at: { gte: new Date(from.getTime() - 5.5 * 3600_000) } });
  if (to) and.push({ issued_at: { lt: new Date(to.getTime() + 24 * 3600_000 - 5.5 * 3600_000) } });
  if (and.length) where.AND = and;

  const [rows, total] = await Promise.all([
    db.credential.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (f.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        certificate_id: true,
        learner_name: true,
        program_name: true,
        completion_date: true,
        issued_at: true,
        expires_at: true,
        status: true,
        credential_type: true,
        details: true,
        batch: { select: { name: true } },
        student: { select: { email: true } },
        deliveries: { orderBy: { created_at: "desc" }, take: 1, select: { status: true } },
      },
    }),
    db.credential.count({ where }),
  ]);

  return {
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    rows: rows.map((r) => ({
      id: r.id,
      certificateId: r.certificate_id,
      credentialType: r.credential_type as CredentialType,
      internshipTitle: r.credential_type === "INTERNSHIP_COMPLETION" ? ((r.details as { internshipTitle?: string }).internshipTitle ?? null) : null,
      learnerName: r.learner_name,
      email: includePrivate ? r.student.email : null,
      programName: r.program_name,
      cohort: r.batch?.name ?? null,
      completionDate: r.completion_date,
      issuedAt: r.issued_at,
      displayStatus: derivePublicStatus(r) ?? r.status,
      lastDelivery: r.deliveries[0]?.status ?? null,
    })),
  };
}

export async function getCredentialDetail(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return db.credential.findUnique({
    where: { id },
    include: {
      student: true,
      course: { include: { batches: { orderBy: { created_at: "desc" }, select: { id: true, name: true } } } },
      batch: true,
      template: { select: { id: true, version: true, name: true, is_production: true } },
      supersedes: { select: { id: true, certificate_id: true, status: true } },
      superseded_by: { select: { id: true, certificate_id: true, status: true } },
      created_by: { select: { name: true, email: true } },
      revoked_by: { select: { name: true } },
      events: { orderBy: { created_at: "desc" }, include: { actor: { select: { name: true } } } },
      deliveries: { orderBy: { created_at: "desc" }, include: { triggered_by: { select: { name: true } } } },
    },
  });
}

export async function dashboardStats() {
  const today = indianDate(new Date());
  const since30 = new Date(Date.now() - 30 * 24 * 3600_000);
  const [byStatus, expired, issued30, failedDeliveries, failedCredentials, byProgram, byType, recent] = await Promise.all([
    db.credential.groupBy({ by: ["status"], _count: { _all: true } }),
    db.credential.count({ where: { status: "VALID", expires_at: { lte: today } } }),
    db.credential.count({ where: { status: { in: ["VALID", "REVOKED", "SUPERSEDED"] }, issued_at: { gte: since30 } } }),
    db.credentialEmailDelivery.findMany({
      where: { status: "FAILED" },
      orderBy: { created_at: "desc" },
      take: 10,
      select: { id: true, created_at: true, last_error: true, credential: { select: { id: true, certificate_id: true, learner_name: true, status: true } } },
    }),
    db.credential.findMany({ where: { status: "FAILED" }, orderBy: { updated_at: "desc" }, take: 10, select: { id: true, certificate_id: true, learner_name: true, last_error: true } }),
    db.credential.groupBy({ by: ["course_id", "status"], _count: { _all: true } }),
    db.credential.groupBy({ by: ["credential_type", "status"], _count: { _all: true } }),
    db.credentialEvent.findMany({
      orderBy: { created_at: "desc" },
      take: 12,
      select: { id: true, type: true, created_at: true, actor: { select: { name: true } }, credential: { select: { id: true, certificate_id: true } } },
    }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const courses = await db.course.findMany({ where: { id: { in: [...new Set(byProgram.map((b) => b.course_id))] } }, select: { id: true, name: true } });
  const programs = courses.map((c) => ({
    name: c.name,
    valid: byProgram.filter((b) => b.course_id === c.id && b.status === "VALID").reduce((a, b) => a + b._count._all, 0),
    revoked: byProgram.filter((b) => b.course_id === c.id && b.status === "REVOKED").reduce((a, b) => a + b._count._all, 0),
    superseded: byProgram.filter((b) => b.course_id === c.id && b.status === "SUPERSEDED").reduce((a, b) => a + b._count._all, 0),
  }));
  const sum = (type: CredentialType, status: string) =>
    byType.filter((b) => b.credential_type === type && b.status === status).reduce((a, b) => a + b._count._all, 0);
  const types = CREDENTIAL_TYPES.map((t) => ({
    type: t,
    label: CREDENTIAL_TYPE_DEFINITIONS[t].label,
    valid: sum(t, "VALID"),
    revoked: sum(t, "REVOKED"),
    superseded: sum(t, "SUPERSEDED"),
  }));
  // Undelivered = failed deliveries whose credential has no later successful send.
  const undelivered = [] as typeof failedDeliveries;
  for (const d of failedDeliveries) {
    const laterOk = await db.credentialEmailDelivery.count({ where: { credential_id: d.credential.id, status: "SENT", created_at: { gt: d.created_at } } });
    if (!laterOk) undelivered.push(d);
  }
  return {
    valid: count("VALID") - expired,
    expired,
    revoked: count("REVOKED"),
    superseded: count("SUPERSEDED"),
    failed: count("FAILED"),
    issuing: count("ISSUING"),
    issued30,
    undelivered,
    failedCredentials,
    programs,
    types,
    recent,
  };
}

export const auditFiltersSchema = z.object({
  type: z.string().max(40).optional(),
  actorId: z.string().max(60).optional(),
  certificateId: z.string().max(40).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export async function listAuditEvents(f: z.infer<typeof auditFiltersSchema>) {
  const where: Prisma.CredentialEventWhereInput = {};
  if (f.type) where.type = f.type as Prisma.CredentialEventWhereInput["type"];
  if (f.actorId) where.actor_id = f.actorId;
  if (f.certificateId) where.credential = { certificate_id: f.certificateId.toUpperCase().trim() };
  const from = f.from ? parseISODate(f.from) : null;
  const to = f.to ? parseISODate(f.to) : null;
  if (from || to) {
    where.created_at = {
      ...(from ? { gte: new Date(from.getTime() - 5.5 * 3600_000) } : {}),
      ...(to ? { lt: new Date(to.getTime() + 24 * 3600_000 - 5.5 * 3600_000) } : {}),
    };
  }
  const [rows, total] = await Promise.all([
    db.credentialEvent.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (f.page - 1) * 50,
      take: 50,
      include: { actor: { select: { name: true } }, credential: { select: { id: true, certificate_id: true } } },
    }),
    db.credentialEvent.count({ where }),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / 50)) };
}

export async function listPrograms() {
  return db.course.findMany({
    orderBy: { name: "asc" },
    include: {
      batches: { orderBy: { created_at: "desc" } },
      certificate_templates: { orderBy: { version: "desc" } },
      _count: { select: { credentials: true } },
    },
  });
}

export async function listLearners(q: string | undefined, page: number) {
  const where: Prisma.StudentWhereInput = q
    ? { OR: [{ full_name: { contains: q, mode: "insensitive" } }, { email: { contains: q.toLowerCase(), mode: "insensitive" } }] }
    : { credentials: { some: {} } };
  const [rows, total] = await Promise.all([
    db.student.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        full_name: true,
        email: true,
        credentials: { orderBy: { created_at: "desc" }, select: { id: true, certificate_id: true, program_name: true, status: true, expires_at: true } },
      },
    }),
    db.student.count({ where }),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
