import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { PUBLIC_FIELD_NAMES, toPublicCredential } from "@/src/modules/credentials/public";
import { can, Permission, ROLE_PERMISSIONS } from "@/src/lib/permissions";
import { renderCertificate, preflightCertificate } from "@/src/modules/credentials/render";
import { DEV_TEMPLATE_FIELD_CONFIG } from "@/src/modules/credentials/template-config";
import { fitText } from "@/src/modules/credentials/text-fit";
import { credentialEmail } from "@/src/modules/credentials/email";
import { emailMode, publicBaseUrl } from "@/src/modules/credentials/config";
import { buildInternshipDetails } from "@/src/modules/credentials/credential-types";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("public credential payload", () => {
  const row = {
    certificate_id: "MSC-2026-FND-7K4P92",
    verification_token: "AbCdEfGhIjKlMnOpQrStUv",
    learner_name: "Priya Raman",
    program_name: "MedTech Foundation Program",
    completion_date: d("2026-07-15"),
    issued_at: new Date("2026-09-24T20:00:00Z"),
    expires_at: null,
    status: "VALID" as const,
    credential_type: "COURSE_COMPLETION" as const,
    details: {},
    // Private fields that must never leak even if a caller passes a full row:
    email: "priya@example.com",
    id: "0b7c1f1e-0000-4000-8000-000000000000",
    student_id: "stu_1",
    revocation_reason: "fraud",
    pdf_path: "certificates/x/y.pdf",
  };

  it("contains exactly the approved fields", () => {
    const pub = toPublicCredential(row)!;
    expect(Object.keys(pub).sort()).toEqual([...PUBLIC_FIELD_NAMES].sort());
    const json = JSON.stringify(pub);
    for (const secret of ["priya@example.com", "0b7c1f1e", "stu_1", "fraud", "certificates/"]) expect(json).not.toContain(secret);
  });

  it("uses the Indian issue date and the canonical verification URL", () => {
    const pub = toPublicCredential(row)!;
    expect(pub.issueDate).toBe("2026-09-25");
    expect(pub.verificationUrl).toBe("https://medskillscatalyst.com/verify/AbCdEfGhIjKlMnOpQrStUv");
    expect(pub.issuer).toBe("MedSkills Catalyst");
  });

  it("returns nothing for credentials that are not public", () => {
    expect(toPublicCredential({ ...row, status: "ISSUING" })).toBeNull();
    expect(toPublicCredential({ ...row, status: "FAILED" })).toBeNull();
  });

  it("labels the type and carries no internship block for a course", () => {
    const pub = toPublicCredential(row)!;
    expect(pub.credentialType).toBe("COURSE_COMPLETION");
    expect(pub.credentialTypeLabel).toBe("Course Completion Certificate");
    expect(pub.internship).toBeNull();
  });

  it("publishes an internship's approved details and nothing private", () => {
    const details = buildInternshipDetails({
      internshipTitle: "Clinical Research Intern",
      department: "Clinical Operations",
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      totalHours: 480,
      supervisor: "Dr. Secret Supervisor",
      mode: "ON_SITE",
      location: "Private Hospital Pune",
    });
    const pub = toPublicCredential({ ...row, credential_type: "INTERNSHIP_COMPLETION", details })!;
    expect(pub.credentialTypeLabel).toBe("Internship Completion Certificate");
    expect(pub.internship).toEqual({
      internshipTitle: "Clinical Research Intern",
      department: "Clinical Operations",
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      duration: "3 Months",
    });
    const json = JSON.stringify(pub);
    for (const secret of ["Secret Supervisor", "Pune", "ON_SITE", "480", "priya@example.com"]) expect(json).not.toContain(secret);
  });

  it("offers the PDF only for VALID/EXPIRED", () => {
    expect(toPublicCredential({ ...row, status: "REVOKED" })!.certificateAvailable).toBe(false);
    expect(toPublicCredential({ ...row, status: "SUPERSEDED" })!.certificateAvailable).toBe(false);
  });
});

describe("permission matrix (decision 2026-09-25)", () => {
  it("VIEWER can only view", () => {
    expect(can("VIEWER", Permission.CredentialsView)).toBe(true);
    expect(can("VIEWER", Permission.CredentialsViewPrivate)).toBe(false);
    expect(can("VIEWER", Permission.CredentialsIssue)).toBe(false);
  });
  it("ISSUER and ACCOUNTS issue, bulk issue and resend but do not revoke/reissue/manage", () => {
    for (const role of ["ISSUER", "ACCOUNTS"] as const) {
      expect(can(role, Permission.CredentialsIssue)).toBe(true);
      expect(can(role, Permission.CredentialsBulkIssue)).toBe(true);
      expect(can(role, Permission.CredentialsResend)).toBe(true);
      expect(can(role, Permission.CredentialsRevoke)).toBe(false);
      expect(can(role, Permission.CredentialsReissue)).toBe(false);
      expect(can(role, Permission.TemplatesManage)).toBe(false);
      expect(can(role, Permission.ProgramsManage)).toBe(false);
      expect(can(role, Permission.AuditViewFull)).toBe(false);
      expect(can(role, Permission.StaffManage)).toBe(false);
    }
  });
  it("ADMIN can do everything", () => {
    for (const p of Object.values(Permission)) expect(can("ADMIN", p)).toBe(true);
  });
  it("every role is covered", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(["ACCOUNTS", "ADMIN", "COUNSELOR", "ISSUER", "VIEWER"]);
  });
});

describe("text fit rules", () => {
  const mono = { widthOfTextAtSize: (t: string, s: number) => t.length * s * 0.5 };
  const box = { width: 100, height: 30, size: 20, minSize: 10, maxLines: 2, lineHeight: 1.1 };
  it("keeps the design size when it fits", () => {
    expect(fitText("Short", mono, box)).toEqual({ ok: true, size: 20, lines: ["Short"] });
  });
  it("shrinks before wrapping", () => {
    const r = fitText("A somewhat longer", mono, box);
    expect(r.ok && r.lines.length).toBe(1);
    expect(r.ok && r.size).toBeLessThan(20);
  });
  it("wraps when shrinking alone is not enough, and fails instead of overflowing", () => {
    const r = fitText("Word word word word word word", mono, box);
    expect(r.ok && r.lines.length).toBe(2);
    expect(fitText("x".repeat(500), mono, box).ok).toBe(false);
  });
});

describe("certificate rendering", () => {
  const spec = { background: { kind: "builtin-dev" as const }, fieldConfig: DEV_TEMPLATE_FIELD_CONFIG, signatures: [] };
  const data = {
    learnerName: "Priya Raman",
    programName: "MedTech Foundation Program",
    completionDate: d("2026-07-15"),
    issueDate: d("2026-09-25"),
    expiresOn: null,
    certificateId: "MSC-2026-FND-7K4P92",
    verifyUrl: "https://medskillscatalyst.com/verify/AbCdEfGhIjKlMnOpQrStUv",
  };
  const noAssets = async () => new Uint8Array();

  it("is deterministic (same credential → same bytes)", async () => {
    const a = await renderCertificate(spec, data, noAssets);
    const b = await renderCertificate(spec, data, noAssets);
    expect(a.sha256).toBe(b.sha256);
    expect(Buffer.from(a.bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("embeds a QR that decodes to exactly the verification URL (rasterized at print-like 150dpi)", async () => {
    const out = await renderCertificate(spec, data, noAssets);
    const dir = mkdtempSync(path.join(os.tmpdir(), "qr-"));
    const pdf = path.join(dir, "c.pdf");
    writeFileSync(pdf, out.bytes);
    execFileSync("pdftoppm", ["-r", "150", "-png", "-singlefile", pdf, path.join(dir, "c")]);
    const png = PNG.sync.read(readFileSync(path.join(dir, "c.png")));
    const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(code?.data).toBe(data.verifyUrl);
    expect(out.qr.moduleSizePt).toBeGreaterThan(1.5); // ≥ ~0.53 mm per module at print size
  });

  it("preflight reports names that cannot fit or cannot be printed", async () => {
    const tooLong = await preflightCertificate(spec, { ...data, learnerName: "Supercalifragilisticexpialidocious".repeat(4) }, noAssets);
    expect(tooLong.map((i) => i.field)).toContain("learner_name");
    const unprintable = await preflightCertificate(spec, { ...data, learnerName: "प्रिया रमन" }, noAssets);
    expect(unprintable[0]?.message).toMatch(/characters/);
    expect(await preflightCertificate(spec, data, noAssets)).toEqual([]);
  });
});

describe("learner email", () => {
  it("escapes every interpolated value", () => {
    const m = credentialEmail({
      learnerName: '<script>alert("x")</script> Raman',
      programName: "A & B <b>",
      certificateId: "MSC-2026-FND-7K4P92",
      completionDate: d("2026-07-15"),
      verifyUrl: "https://medskillscatalyst.com/verify/AbCdEfGhIjKlMnOpQrStUv",
      downloadUrl: "https://medskillscatalyst.com/verify/AbCdEfGhIjKlMnOpQrStUv/certificate",
      isResend: false,
    });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("A &amp; B &lt;b&gt;");
    expect(m.html).toContain("MSC-2026-FND-7K4P92");
    expect(m.html).toContain("View credential");
  });
});

describe("configuration", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  it("canonical URL must be an https origin", () => {
    process.env.CREDENTIAL_PUBLIC_BASE_URL = "https://medskillscatalyst.com";
    expect(publicBaseUrl()).toBe("https://medskillscatalyst.com");
    process.env.CREDENTIAL_PUBLIC_BASE_URL = "http://medskillscatalyst.com";
    expect(() => publicBaseUrl()).toThrow();
    process.env.CREDENTIAL_PUBLIC_BASE_URL = "https://medskillscatalyst.com/verify";
    expect(() => publicBaseUrl()).toThrow();
  });
  it("is required on production", () => {
    delete process.env.CREDENTIAL_PUBLIC_BASE_URL;
    process.env.VERCEL_ENV = "production";
    expect(() => publicBaseUrl()).toThrow();
  });
  it("never emails learners outside production", () => {
    process.env.CREDENTIAL_EMAIL_MODE = "live";
    process.env.VERCEL_ENV = "preview";
    expect(emailMode().mode).toBe("off");
    process.env.VERCEL_ENV = "production";
    expect(emailMode().mode).toBe("live");
    process.env.CREDENTIAL_EMAIL_MODE = "redirect";
    process.env.CREDENTIAL_EMAIL_REDIRECT_TO = "qa@medskillscatalyst.com";
    expect(emailMode()).toEqual({ mode: "redirect", redirectTo: "qa@medskillscatalyst.com" });
  });
});
