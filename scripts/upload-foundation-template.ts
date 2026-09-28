/**
 * Upload assets/credentials/foundation-v1 as a DRAFT template version and write
 * its preview PDF. Same service calls as the admin "Upload approved artwork"
 * form (uploadTemplateAction); never activates.
 *
 *   ACTOR_EMAIL=info@medskillscatalyst.com npx tsx --conditions=react-server scripts/upload-foundation-template.ts
 *
 * Needs DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
 * CREDENTIAL_PUBLIC_BASE_URL in the environment.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";
import { uploadTemplateAsset, createTemplateVersion, previewTemplate } from "../src/modules/credentials/templates";
import { resolveTemplateAssets } from "../src/modules/credentials/template-assets";

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "assets/credentials/foundation-v1");
const slots = {
  asset1: "CormorantGaramond-600.ttf",
  asset2: "InstrumentSans-400.ttf",
  asset3: "InstrumentSans-600.ttf",
  asset4: "signature-gagan-victor.png",
} as const;

async function main() {
  const email = process.env.ACTOR_EMAIL;
  if (!email) throw new Error("Set ACTOR_EMAIL to an individual ADMIN staff email.");
  const actor = await db.staffUser.findFirstOrThrow({ where: { email, role: "ADMIN", is_active: true } });
  const course = await db.course.findUniqueOrThrow({ where: { slug: "foundation-program" } });

  const existing = await db.certificateTemplate.findFirst({
    where: { course_id: course.id, name: "Foundation design v1", status: { in: ["DRAFT", "ACTIVE"] } },
  });
  const template =
    existing ??
    (await (async () => {
      const bg = await uploadTemplateAsset(new Uint8Array(await readFile(path.join(dir, "background.pdf"))), actor);
      const assets: Record<string, { path: string; sha256: string; mime: string }> = {};
      for (const [slot, file] of Object.entries(slots)) {
        assets[slot] = await uploadTemplateAsset(new Uint8Array(await readFile(path.join(dir, file))), actor);
      }
      const layout = JSON.parse(await readFile(path.join(dir, "layout.json"), "utf8"));
      const resolved = resolveTemplateAssets(layout, assets) as { fieldConfig?: unknown; signatures?: unknown };
      return createTemplateVersion(
        {
          courseId: course.id,
          name: "Foundation design v1",
          isProduction: true,
          background: { kind: "storage", path: bg.path, sha256: bg.sha256, mime: bg.mime },
          fieldConfig: resolved.fieldConfig,
          signatures: resolved.signatures ?? [],
          notes: "Owner-approved package assets/credentials/foundation-v1 (Gagan Victor signature authorized). Draft pending preview approval.",
        },
        actor,
      );
    })());

  const pdf = await previewTemplate(template.id);
  const out = path.join(root, "output/pdf", `production-preview-foundation-v${template.version}.pdf`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, pdf);
  console.log({ reused: Boolean(existing), templateId: template.id, version: template.version, status: template.status, preview: out, bytes: pdf.byteLength });
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
