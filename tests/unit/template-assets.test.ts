import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolveTemplateAssets } from "../../src/modules/credentials/template-assets";
import { fieldConfigSchema, signaturesSchema } from "../../src/modules/credentials/template-config";
import { preflightCertificate } from "../../src/modules/credentials/render";

const font = { path: "templates/font.ttf", sha256: "a".repeat(64), mime: "font/ttf" };
describe("template upload asset references", () => {
  it("blocks unsupported glyphs in an uploaded custom font before issuing", async () => {
    const layout = JSON.parse(readFileSync("assets/credentials/foundation-v1/layout.json", "utf8"));
    const files: Record<string, string> = { asset1: "CormorantGaramond-600.ttf", asset2: "InstrumentSans-400.ttf", asset3: "InstrumentSans-600.ttf" };
    const issues = await preflightCertificate({ ...layout, background: { kind: "builtin-dev" } }, {
      learnerName: "प्रिया रमन", programName: "Foundation Module", completionDate: new Date("2026-09-26"), issueDate: new Date("2026-09-27"), expiresOn: null,
      certificateId: "MSC-2026-PREV-234567", verifyUrl: "https://example.com/verify/preview",
    }, async (key) => readFileSync(`assets/credentials/foundation-v1/${files[key.replace("asset:", "")]}`));
    expect(issues.some((issue) => issue.field === "learner_name" && issue.message.includes("cannot print"))).toBe(true);
  });
  it("resolves font metadata as a flat reference using the uploaded digest", () => {
    expect(resolveTemplateAssets({ font: { kind: "asset", path: "asset:asset1", sha256: "stale" } }, { asset1: font }))
      .toEqual({ font: { kind: "asset", path: font.path, sha256: font.sha256 } });
  });
  it("keeps signature image shorthand and standard fonts working", () => {
    const image = { ...font, path: "templates/signature.png", mime: "image/png" };
    expect(resolveTemplateAssets({ signatures: [{ image: "asset:asset4" }], font: { kind: "standard", name: "Helvetica" } }, { asset4: image }))
      .toEqual({ signatures: [{ image }], font: { kind: "standard", name: "Helvetica" } });
  });
  it("rejects missing assets and image uploads used as fonts", () => {
    expect(() => resolveTemplateAssets("asset:asset1", {})).toThrow("no file was uploaded");
    expect(() => resolveTemplateAssets({ kind: "asset", path: "asset:asset1" }, { asset1: { ...font, mime: "image/png" } })).toThrow("TTF or OTF");
  });
  it("accepts the signed Foundation package after resolving fonts and signature", () => {
    const layout = JSON.parse(readFileSync("assets/credentials/foundation-v1/layout.json", "utf8"));
    const files = ["CormorantGaramond-600.ttf", "InstrumentSans-400.ttf", "InstrumentSans-600.ttf", "signature-gagan-victor.png"];
    const assets = Object.fromEntries(files.map((filename, i) => [`asset${i + 1}`, {
      path: `templates/${filename}`, mime: filename.endsWith(".png") ? "image/png" : "font/ttf",
      sha256: createHash("sha256").update(readFileSync(`assets/credentials/foundation-v1/${filename}`)).digest("hex"),
    }]));
    const resolved = resolveTemplateAssets(layout, assets) as { fieldConfig: unknown; signatures: unknown };
    expect(fieldConfigSchema.parse(resolved.fieldConfig).fields.learner_name.font).toEqual({ kind: "asset", path: assets.asset1.path, sha256: assets.asset1.sha256 });
    expect(signaturesSchema.parse(resolved.signatures)[0].image).toEqual(assets.asset4);
  });
});
