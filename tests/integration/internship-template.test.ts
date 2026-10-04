import { describe, expect, it } from "vitest";
import { buildInternshipPackage, SPECIMENS } from "../../scripts/build-internship-template";
import { renderCertificate, preflightCertificate } from "@/src/modules/credentials/render";
import { missingRequiredFields } from "@/src/modules/credentials/template-config";
import { createTemplateVersion, activateTemplate, uploadTemplateAsset } from "@/src/modules/credentials/templates";
import { resolveTemplateAssets } from "@/src/modules/credentials/template-assets";
import { loadFonts, SIGNATURE_PATH } from "../../scripts/lib/certificate-artwork";
import { readFile } from "node:fs/promises";
import { db, deps, program, staff } from "../helpers";

describe("internship certificate package (the course design, adapted)", () => {
  it("is a complete internship layout and is refused as a course layout", async () => {
    const pkg = await buildInternshipPackage();
    expect(missingRequiredFields("INTERNSHIP_COMPLETION", pkg.spec.fieldConfig)).toEqual([]);
    expect(missingRequiredFields("COURSE_COMPLETION", pkg.spec.fieldConfig)).toEqual(["program name", "completion date"]);
  });

  it("renders typical, longest and minimal internships without overflow", async () => {
    const pkg = await buildInternshipPackage();
    for (const [, data] of SPECIMENS) {
      expect(await preflightCertificate(pkg.spec, data, pkg.loader)).toEqual([]);
      expect((await renderCertificate(pkg.spec, data, pkg.loader)).bytes.byteLength).toBeGreaterThan(20_000);
    }
  });

  it("refuses an internship name too long for one line, at review time", async () => {
    const pkg = await buildInternshipPackage();
    const [, base] = SPECIMENS[0];
    const issues = await preflightCertificate(pkg.spec, { ...base, internship: { ...base.internship!, title: "Clinical Research ".repeat(7).trim() } }, pkg.loader);
    expect(issues.map((i) => i.field)).toContain("internship_title");
  });

  it("uploads and activates on an internship program through the same path as production", async () => {
    const p = await program({ credentialType: "INTERNSHIP_COMPLETION" });
    const admin = await staff("ADMIN");
    const pkg = await buildInternshipPackage();
    const d = deps();
    const fonts = await loadFonts();
    const assets: Record<string, { path: string; sha256: string; mime: string }> = {};
    for (const [slot, bytes] of Object.entries({ asset1: fonts.serif, asset2: fonts.body, asset3: fonts.bold, asset4: await readFile(SIGNATURE_PATH) })) {
      assets[slot] = await uploadTemplateAsset(new Uint8Array(bytes), admin, d);
    }
    const bg = await uploadTemplateAsset(pkg.background, admin, d);
    const resolved = resolveTemplateAssets(JSON.parse(JSON.stringify(pkg.layout)), assets) as { fieldConfig: unknown; signatures: unknown };
    const t = await createTemplateVersion(
      { courseId: p.course.id, name: "Internship design v1", isProduction: true, background: { kind: "storage", path: bg.path, sha256: bg.sha256, mime: bg.mime }, fieldConfig: resolved.fieldConfig, signatures: resolved.signatures },
      admin,
      d,
    );
    const active = await activateTemplate(t.id, admin, d);
    expect(active.status).toBe("ACTIVE");
    expect((await db.certificateTemplate.findUniqueOrThrow({ where: { id: t.id } })).is_production).toBe(true);
  });
});
