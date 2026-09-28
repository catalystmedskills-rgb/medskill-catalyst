import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { program, deps, issueInput } from "../helpers";
import { uploadTemplateAsset, createTemplateVersion, activateTemplate } from "../../src/modules/credentials/templates";
import { resolveTemplateAssets } from "../../src/modules/credentials/template-assets";
import { issueCredential } from "../../src/modules/credentials/service";

it("uploads the Foundation package, activates a production template and issues through the real pipeline", async () => {
  const p = await program();
  const d = deps();
  const dir = "assets/credentials/foundation-v1";
  const background = await uploadTemplateAsset(await readFile(`${dir}/background.pdf`), p.admin, d);
  const assets: Record<string, Awaited<ReturnType<typeof uploadTemplateAsset>>> = {};
  for (const [i, file] of ["CormorantGaramond-600.ttf", "InstrumentSans-400.ttf", "InstrumentSans-600.ttf", "signature-gagan-victor.png"].entries()) {
    assets[`asset${i + 1}`] = await uploadTemplateAsset(await readFile(`${dir}/${file}`), p.admin, d);
  }
  const layout = resolveTemplateAssets(JSON.parse(await readFile(`${dir}/layout.json`, "utf8")), assets) as { fieldConfig: unknown; signatures: unknown };
  const template = await createTemplateVersion({ courseId: p.course.id, name: "Foundation integration test", isProduction: true, background: { kind: "storage", ...background }, ...layout }, p.admin, d);
  await activateTemplate(template.id, p.admin, d);
  const result = await issueCredential(issueInput(p, { fullName: "Dr. Aanya Venkataraman-Krishnaswamy", sendEmail: false }), p.admin, d);
  expect(result.credential.status).toBe("VALID");
  expect(result.credential.template_id).toBe(template.id);
  expect(result.credential.pdf_path).toBeTruthy();
  expect((await d.storage.get(result.credential.pdf_path!)).byteLength).toBeGreaterThan(1000);
});
