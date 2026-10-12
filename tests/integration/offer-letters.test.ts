import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db, deps, key, program, staff, storage } from "../helpers";
import { buildOfferLetterPackage, OFFER_SPECIMENS } from "../../scripts/build-offer-letter-template";
import { SIGNATURE_PATH } from "../../scripts/lib/certificate-artwork";
import { activateTemplate, createTemplateVersion, uploadTemplateAsset } from "@/src/modules/credentials/templates";
import { resolveTemplateAssets } from "@/src/modules/credentials/template-assets";
import { preflightCertificate } from "@/src/modules/credentials/render";
import { issueCredential, reissueCredential, revokeCredential } from "@/src/modules/credentials/service";
import { verifyByToken } from "@/src/modules/credentials/verify";
import { bulkResultsCsv, bulkTemplateCsv, confirmBulkJob, createBulkJob, processBulkChunk } from "@/src/modules/credentials/bulk";

/** An OFFER_LETTER program with the real offer letter package uploaded and active. */
async function offerProgram() {
  const admin = await staff("ADMIN");
  const code = `O${randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase()}`;
  const course = await db.course.create({ data: { name: "MedSkills Offer Letters", slug: `offers-${code.toLowerCase()}`, base_price_paise: 0, code, credential_type: "OFFER_LETTER" } });
  const pkg = await buildOfferLetterPackage();
  const d = deps();
  const fontBytes = { asset1: await readFile("assets/fonts/InstrumentSans-400.ttf"), asset2: await readFile("assets/fonts/InstrumentSans-600.ttf"), asset4: await readFile(SIGNATURE_PATH) };
  const assets: Record<string, { path: string; sha256: string; mime: string }> = {};
  for (const [slot, bytes] of Object.entries(fontBytes)) assets[slot] = await uploadTemplateAsset(new Uint8Array(bytes), admin, d);
  const bg = await uploadTemplateAsset(pkg.background, admin, d);
  const resolved = resolveTemplateAssets(JSON.parse(JSON.stringify(pkg.layout)), assets) as { fieldConfig: unknown; signatures: unknown };
  const t = await createTemplateVersion({ courseId: course.id, name: "Offer letter v1", isProduction: true, background: { kind: "storage", path: bg.path, sha256: bg.sha256, mime: bg.mime }, fieldConfig: resolved.fieldConfig, signatures: resolved.signatures }, admin, d);
  await activateTemplate(t.id, admin, d);
  return { course, admin };
}

const offer = (over: Record<string, unknown> = {}) => ({
  offerType: "INTERNSHIP", role: "MedTech Sales Intern", institution: "K.K. Wagh College of Pharmacy, Nashik",
  startDate: "2099-10-15", durationCount: 2, durationUnit: "MONTHS", mode: "REMOTE", stipendRupees: 5000, stipendPeriod: "PER_MONTH", ...over,
});
const input = (p: { course: { id: string } }, over: Record<string, unknown> = {}) => ({
  fullName: "Sejal Sanjay Khapare", email: `sejal-${randomUUID().slice(0, 8)}@example.test`, courseId: p.course.id,
  credentialType: "OFFER_LETTER" as "OFFER_LETTER" | "COURSE_COMPLETION", offer: offer() as Record<string, unknown> | undefined, sendEmail: true, idempotencyKey: key(), ...over,
});

describe("offer letters", () => {
  it("both offer types and the longest values fit the letter", async () => {
    const pkg = await buildOfferLetterPackage();
    for (const [, data] of OFFER_SPECIMENS) expect(await preflightCertificate(pkg.spec, data, pkg.loader)).toEqual([]);
  });

  it("issues end to end: future start allowed, dated today, PDF stored, public page minimal, email sent", async () => {
    const p = await offerProgram();
    const sent: { to: string; subject: string; html: string }[] = [];
    process.env.CREDENTIAL_EMAIL_MODE = "redirect";
    process.env.CREDENTIAL_EMAIL_REDIRECT_TO = "qa@medskillscatalyst.test";
    const r = await issueCredential(input(p), p.admin, deps({ mailer: async (m) => (sent.push(m), { ok: true, id: "m1" }) })).finally(() => {
      process.env.CREDENTIAL_EMAIL_MODE = "off";
    });
    expect(r.credential.status).toBe("VALID");
    expect(r.credential.credential_type).toBe("OFFER_LETTER");
    expect(r.credential.certificate_id).toMatch(new RegExp(`^MSC-\\d{4}-${p.course.code}-`));
    const details = r.credential.details as { stipend: { amountPaise: number }; greetingName: string; duration: { label: string } };
    expect(details.stipend.amountPaise).toBe(500_000);
    expect(details.greetingName).toBe("Sejal");
    expect((await storage.get(r.credential.pdf_path!)).byteLength).toBeGreaterThan(10_000);

    const v = await verifyByToken(r.credential.verification_token, `t-${randomUUID()}`);
    expect(v.kind).toBe("found");
    if (v.kind !== "found") return;
    expect(v.credential.credentialTypeLabel).toBe("Offer Letter");
    expect(v.credential.offer).toEqual({ offerType: "Internship", role: "MedTech Sales Intern", startDate: "2099-10-15" });
    expect(JSON.stringify(v)).not.toMatch(/5,000|500000|Wagh|REMOTE|Remote|@example\.test|Months/);

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("MedTech Sales Intern");
    expect(sent[0].html).toContain("offer letter");
    expect(sent[0].html).not.toMatch(/5,000|stipend/i);
  });

  it("refuses duplicates of the same offer and offers on a non-offer program", async () => {
    const p = await offerProgram();
    const email = `dup-${randomUUID().slice(0, 8)}@example.test`;
    await issueCredential(input(p, { email }), p.admin, deps());
    await expect(issueCredential(input(p, { email, offer: offer({ role: "medtech sales INTERN" }) }), p.admin, deps())).rejects.toMatchObject({ code: "DUPLICATE" });
    const other = await issueCredential(input(p, { email, offer: offer({ offerType: "CAMPUS_AMBASSADOR", role: "Campus Ambassador" }) }), p.admin, deps());
    expect(other.credential.status).toBe("VALID");
    const course = await program();
    await expect(issueCredential(input(course), course.admin, deps())).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("withdraws (revoke) and revises (reissue): public status follows", async () => {
    const p = await offerProgram();
    const r = await issueCredential(input(p), p.admin, deps());
    const revised = await reissueCredential(r.credential.id, { offer: { role: "MedTech Marketing Intern", startDate: "2099-11-01" }, reason: "Role changed before joining", idempotencyKey: key() }, p.admin, deps());
    expect(revised.credential.status).toBe("VALID");
    expect((revised.credential.details as { role: string; stipend: unknown }).role).toBe("MedTech Marketing Intern");
    expect((revised.credential.details as { stipend: unknown }).stipend).not.toBeNull(); // unchanged fields carried over
    expect((await db.credential.findUniqueOrThrow({ where: { id: r.credential.id } })).status).toBe("SUPERSEDED");

    await revokeCredential(revised.credential.id, "Candidate declined the offer", p.admin, deps());
    const v = await verifyByToken(revised.credential.verification_token, `t-${randomUUID()}`);
    expect(v.kind === "found" && v.credential.status).toBe("REVOKED");
  });

  it("bulk: spreadsheet values parsed, bad rows reported, good rows issued individually", async () => {
    const p = await offerProgram();
    const issuer = await staff("ISSUER");
    const tag = randomUUID().slice(0, 6);
    expect(bulkTemplateCsv("OFR", "OFFER_LETTER")).toMatch(/^full_name,email,offer_type,role,institution,start_date,duration,mode,stipend/);
    const csv = [
      "full_name,email,offer_type,role,institution,start_date,duration,mode,stipend,stipend_period",
      `Sejal Khapare,sejal-${tag}@example.test,Internship,MedTech Sales Intern,"K.K. Wagh College, Nashik",15/10/2099,2 months,Remote,,`,
      `Rohan Deshmukh,rohan-${tag}@example.test,CA,Campus Ambassador,,01/11/2099,6 months,Hybrid,2000,monthly`,
      `Bad Type,bad1-${tag}@example.test,Volunteer,Helper,,01/11/2099,6 months,Remote,,`,
      `Bad Duration,bad2-${tag}@example.test,Internship,Intern,,01/11/2099,6,Remote,,`,
      `No Period,bad3-${tag}@example.test,Internship,Intern,,01/11/2099,6 weeks,Remote,1000,`,
    ].join("\n");
    const job = await createBulkJob({ bytes: new TextEncoder().encode(csv), fileName: "offers.csv", courseId: p.course.id, defaultBatchId: null, sendEmail: false }, issuer, deps());
    const rows = await db.credentialBulkRow.findMany({ where: { job_id: job.id }, orderBy: { row_number: "asc" } });
    const msg = (n: number) => (rows[n].messages as { text: string }[]).map((m) => m.text).join(" | ");
    expect(rows.slice(0, 2).map((r) => r.validation)).toEqual(["VALID", "VALID"]);
    expect(msg(2)).toMatch(/Internship or Campus Ambassador/);
    expect(msg(3)).toMatch(/2 months/);
    expect(msg(4)).toMatch(/per month or in total/);

    await confirmBulkJob(job.id, issuer, deps());
    for (let i = 0; i < 10; i++) if ((await processBulkChunk(job.id, issuer, deps(), 5)).remaining === 0) break;
    const done = await db.credentialBulkRow.findMany({ where: { job_id: job.id, outcome: "SUCCESS" }, include: { credential: true } });
    expect(done).toHaveLength(2);
    expect((done.find((r) => (r.credential!.details as { offerType: string }).offerType === "CAMPUS_AMBASSADOR")!.credential!.details as { stipend: { label: string } }).stipend.label).toBe("INR 2,000 per month");
    const out = await bulkResultsCsv(job.id, false, deps());
    expect(out.split("\r\n")[0]).toBe("row,full_name,offer_type,role,start_date,outcome,certificate_id,verification_url,message");
    expect(out).not.toMatch(/@example\.test|2,000/);
  });
});
