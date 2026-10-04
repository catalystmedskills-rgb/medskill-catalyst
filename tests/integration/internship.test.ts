import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, deps, key, program, staff, storage } from "../helpers";
import { issueCredential, planIssue, issueInputSchema, reissueCredential, revokeCredential } from "@/src/modules/credentials/service";
import { verifyByToken } from "@/src/modules/credentials/verify";
import { activateTemplate, createDevTemplate } from "@/src/modules/credentials/templates";

const internship = (over: Record<string, unknown> = {}) => ({
  internshipTitle: "Clinical Research Intern",
  department: "Clinical Operations",
  startDate: "2026-06-01",
  endDate: "2026-08-31",
  totalHours: 480,
  supervisor: "Dr. Private Supervisor",
  mode: "HYBRID",
  location: "Pune",
  ...over,
});

const input = (p: { course: { id: string } }, over: Record<string, unknown> = {}) => ({
  fullName: "Aarav Mehta",
  email: `intern-${randomUUID().slice(0, 8)}@example.test`,
  courseId: p.course.id,
  credentialType: "INTERNSHIP_COMPLETION" as "INTERNSHIP_COMPLETION" | "COURSE_COMPLETION",
  internship: internship() as Record<string, unknown> | undefined,
  sendEmail: true,
  idempotencyKey: key(),
  ...over,
});

describe("internship completion credentials", () => {
  it("issues end to end: duration from the dates, PDF stored, public page allowlisted, email sent", async () => {
    const p = await program({ credentialType: "INTERNSHIP_COMPLETION" });
    const sent: { to: string; subject: string; html: string }[] = [];
    const d = deps({ mailer: async (m) => (sent.push(m), { ok: true, id: "m1" }) });
    process.env.CREDENTIAL_EMAIL_MODE = "redirect";
    process.env.CREDENTIAL_EMAIL_REDIRECT_TO = "qa@medskillscatalyst.test";
    const r = await issueCredential(input(p), p.admin, d).finally(() => {
      process.env.CREDENTIAL_EMAIL_MODE = "off";
    });
    expect(r.credential.status).toBe("VALID");
    expect(r.credential.credential_type).toBe("INTERNSHIP_COMPLETION");
    expect(r.credential.completion_date.toISOString().slice(0, 10)).toBe("2026-08-31");
    const details = r.credential.details as { duration: { label: string }; totalHours: number; supervisor: string };
    expect(details.duration.label).toBe("3 Months");
    expect(details.totalHours).toBe(480);
    expect(details.supervisor).toBe("Dr. Private Supervisor"); // kept internally
    expect((await storage.get(r.credential.pdf_path!)).byteLength).toBeGreaterThan(1000);

    const v = await verifyByToken(r.credential.verification_token, `t-${randomUUID()}`);
    expect(v.kind).toBe("found");
    if (v.kind !== "found") return;
    expect(v.credential.credentialTypeLabel).toBe("Internship Completion Certificate");
    expect(v.credential.internship).toEqual({
      internshipTitle: "Clinical Research Intern",
      department: "Clinical Operations",
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      duration: "3 Months",
    });
    expect(JSON.stringify(v)).not.toMatch(/Private Supervisor|Pune|HYBRID|480|@example\.test/);

    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain("Clinical Research Intern");
    expect(sent[0].html).toContain("3 Months");
    expect(sent[0].html).toContain("completing your internship");
  });

  it("never takes a duration from the admin", async () => {
    const p = await program({ credentialType: "INTERNSHIP_COMPLETION" });
    const r = await issueCredential(input(p, { internship: { ...internship(), endDate: "2026-06-28", duration: "1 Year" } }), p.admin, deps());
    expect((r.credential.details as { duration: { label: string } }).duration.label).toBe("4 Weeks");
  });

  it("treats the same title and dates as one internship; different dates are a different one", async () => {
    const p = await program({ credentialType: "INTERNSHIP_COMPLETION" });
    const email = `dup-${randomUUID().slice(0, 8)}@example.test`;
    await issueCredential(input(p, { email }), p.admin, deps());
    await expect(
      issueCredential(input(p, { email, internship: internship({ internshipTitle: "clinical  research INTERN" }) }), p.admin, deps()),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
    const second = await issueCredential(input(p, { email, internship: internship({ startDate: "2026-09-01", endDate: "2026-09-30" }) }), p.admin, deps());
    expect(second.credential.status).toBe("VALID");
  });

  it("refuses a type that doesn't match the program, missing details, and future end dates", async () => {
    const intern = await program({ credentialType: "INTERNSHIP_COMPLETION" });
    const course = await program();
    await expect(issueCredential(input(intern, { credentialType: "COURSE_COMPLETION" }), intern.admin, deps())).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(issueCredential(input(course), course.admin, deps())).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(issueCredential(input(intern, { internship: undefined }), intern.admin, deps())).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(issueCredential(input(intern, { internship: internship({ endDate: "2099-01-31" }) }), intern.admin, deps())).rejects.toThrow(/end date is in the future/);
    await expect(issueCredential(input(intern, { internship: internship({ endDate: "2026-05-01" }) }), intern.admin, deps())).rejects.toThrow(/before the start/);
  });

  it("plans without writing, so the review step can show the computed duration", async () => {
    const p = await program({ credentialType: "INTERNSHIP_COMPLETION" });
    const before = await db.credential.count();
    const plan = await planIssue(issueInputSchema.parse(input(p, { internship: internship({ endDate: "2026-08-15" }) })), deps());
    expect(plan.credentialType).toBe("INTERNSHIP_COMPLETION");
    expect(plan.internship?.duration.label).toBe("2 Months 15 Days");
    expect(await db.credential.count()).toBe(before);
  });

  it("supports the full lifecycle: reissue recomputes the duration and supersedes; revoke is terminal", async () => {
    const p = await program({ credentialType: "INTERNSHIP_COMPLETION" });
    const r = await issueCredential(input(p), p.admin, deps());
    const re = await reissueCredential(r.credential.id, { internship: { endDate: "2026-07-31" }, reason: "End date corrected by supervisor", idempotencyKey: key() }, p.admin, deps());
    expect(re.credential.status).toBe("VALID");
    expect((re.credential.details as { duration: { label: string }; internshipTitle: string }).duration.label).toBe("2 Months");
    expect((re.credential.details as { internshipTitle: string }).internshipTitle).toBe("Clinical Research Intern");
    expect((await db.credential.findUniqueOrThrow({ where: { id: r.credential.id } })).status).toBe("SUPERSEDED");

    const revoked = await revokeCredential(re.credential.id, "Issued in error during a test", p.admin, deps());
    expect(revoked.status).toBe("REVOKED");
    const v = await verifyByToken(re.credential.verification_token, `t-${randomUUID()}`);
    expect(v.kind === "found" && v.credential.status).toBe("REVOKED");
  });

  it("the database freezes type and details once issued, and keeps type consistent with the program", async () => {
    const p = await program({ credentialType: "INTERNSHIP_COMPLETION" });
    const r = await issueCredential(input(p), p.admin, deps());
    await expect(db.credential.update({ where: { id: r.credential.id }, data: { details: { internshipTitle: "Edited" } } })).rejects.toThrow(/cannot be edited/);
    await expect(db.credential.update({ where: { id: r.credential.id }, data: { credential_type: "COURSE_COMPLETION" } })).rejects.toThrow(/immutable/);
    await expect(db.course.update({ where: { id: p.course.id }, data: { credential_type: "COURSE_COMPLETION" } })).rejects.toThrow(/cannot change/);

    const course = await program();
    const student = await db.student.create({ data: { full_name: "X", email: `x-${randomUUID().slice(0, 8)}@example.test` } });
    await expect(
      db.credential.create({
        data: {
          certificate_id: `MSC-2026-TST-${randomUUID().slice(0, 6).toUpperCase()}`,
          verification_token: randomUUID().replace(/-/g, "").slice(0, 22),
          idempotency_key: key(),
          student_id: student.id,
          course_id: course.course.id,
          template_id: course.template.id,
          learner_name: "X",
          program_name: "Y",
          completion_date: new Date("2026-07-01"),
          issued_at: new Date(),
          credential_type: "INTERNSHIP_COMPLETION",
          created_by_id: course.admin.id,
        },
      }),
    ).rejects.toThrow(/does not match/);
  });

  it("an internship program can't activate a template that doesn't print the internship", async () => {
    const p = await program({ credentialType: "INTERNSHIP_COMPLETION" });
    const admin = await staff("ADMIN");
    const draft = await createDevTemplate(p.course.id, admin, deps());
    // Swap in the course-only layout (allowed while DRAFT), then try to activate it.
    const courseLayout = (await import("@/src/modules/credentials/template-config")).DEV_TEMPLATE_FIELD_CONFIG;
    await db.certificateTemplate.update({ where: { id: draft.id }, data: { field_config: courseLayout } });
    await expect(activateTemplate(draft.id, admin, deps())).rejects.toThrow(/internship name/);
  });
});

describe("bulk internship issuance", () => {
  const enc = (s: string) => new TextEncoder().encode(s);

  it("upload → validate → duration → duplicates → preview → confirm → individual credentials → row results", async () => {
    const { bulkResultsCsv, bulkTemplateCsv, confirmBulkJob, createBulkJob, processBulkChunk } = await import("@/src/modules/credentials/bulk");
    const p = await program({ credentialType: "INTERNSHIP_COMPLETION" });
    const issuer = await staff("ISSUER");
    const tag = randomUUID().slice(0, 6);
    expect(bulkTemplateCsv("INT", "INTERNSHIP_COMPLETION")).toMatch(/^full_name,email,internship_name,department,start_date,end_date,total_hours/);

    const csv = [
      "full_name,email,internship_title,department,start_date,end_date,total_hours,supervisor,mode,location,duration",
      `Aarav Mehta,aarav-${tag}@example.test,Clinical Research Intern,Clinical Ops,01/06/2026,31/08/2026,480,Dr. Sharma,On-site,Pune,9 Years`,
      `Diya Shah,diya-${tag}@example.test,Regulatory Intern,,2026-06-01,2026-06-28,,,remote,,`,
      `Aarav Mehta,AARAV-${tag}@example.test,clinical research intern,,01/06/2026,31/08/2026,,,,,`,
      `Kabir Rao,kabir-${tag}@example.test,QA Intern,,2026-07-01,2026-06-01,,,,,`,
      `Meera Iyer,meera-${tag}@example.test,QA Intern,,2026-06-01,2026-07-15,,,offshore,,`,
      `Rohan Das,rohan-${tag}@example.test,Pharmacovigilance Intern,,2026-06-01,2026-08-15,12.25,,,,`,
    ].join("\n");
    const job = await createBulkJob({ bytes: enc(csv), fileName: "interns.csv", courseId: p.course.id, defaultBatchId: null, sendEmail: false }, issuer, deps());
    expect(job.credential_type).toBe("INTERNSHIP_COMPLETION");

    const rows = await db.credentialBulkRow.findMany({ where: { job_id: job.id }, orderBy: { row_number: "asc" } });
    const msgs = (n: number) => (rows[n].messages as { text: string }[]).map((m) => m.text).join(" | ");
    const dur = (n: number) => (rows[n].input as { internship: { duration: { label: string } } }).internship.duration.label;
    expect(rows[0].validation).toBe("WARNING"); // ignored "duration" column
    expect(msgs(0)).toMatch(/duration.*ignored|ignored.*duration/i);
    expect(dur(0)).toBe("3 Months");
    expect(rows[1].validation).toBe("VALID");
    expect(dur(1)).toBe("4 Weeks");
    expect(rows[2].validation).toBe("ERROR");
    expect(msgs(2)).toMatch(/Duplicate of row 2/);
    expect(msgs(3)).toMatch(/before the start/);
    expect(msgs(4)).toMatch(/On-site, Remote or Hybrid/);
    expect(msgs(5)).toMatch(/hours/i);

    await confirmBulkJob(job.id, issuer, deps());
    for (let i = 0; i < 10; i++) if ((await processBulkChunk(job.id, issuer, deps(), 5)).remaining === 0) break;

    const done = await db.credentialBulkRow.findMany({ where: { job_id: job.id }, orderBy: { row_number: "asc" }, include: { credential: true } });
    const issued = done.filter((r) => r.outcome === "SUCCESS");
    expect(issued).toHaveLength(2);
    const [a, b] = issued.map((r) => r.credential!);
    expect(a.certificate_id).not.toBe(b.certificate_id);
    expect(a.verification_token).not.toBe(b.verification_token);
    expect(a.pdf_path && b.pdf_path).toBeTruthy();
    expect((a.details as { duration: { label: string } }).duration.label).toBe("3 Months");
    expect(a.source).toBe("BULK");

    const out = await bulkResultsCsv(job.id, false, deps());
    expect(out.split("\r\n")[0]).toBe("row,full_name,internship_name,start_date,end_date,duration,outcome,certificate_id,verification_url,message");
    expect(out).toContain("Clinical Research Intern,2026-06-01,2026-08-31,3 Months,SUCCESS");
    expect(out).not.toContain("@example.test");
  });
});
