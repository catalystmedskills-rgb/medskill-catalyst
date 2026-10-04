/**
 * Upload assets/credentials/internship-v1 as a DRAFT template on the INT program and
 * write its production preview PDF. Same service calls as the admin "Upload approved
 * artwork" form. Fonts and Gagan Victor's signature come from foundation-v1 (one copy).
 * Activates only with --activate, after the preview has been checked.
 *
 *   ACTOR_EMAIL=info@medskillscatalyst.com npx tsx --conditions=react-server scripts/upload-internship-template.ts [--activate]
 *
 * Needs DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and CREDENTIAL_PUBLIC_BASE_URL.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";
import { activateTemplate, createTemplateVersion, previewTemplate, uploadTemplateAsset } from "../src/modules/credentials/templates";
import { resolveTemplateAssets } from "../src/modules/credentials/template-assets";
import { defaultDeps } from "../src/modules/credentials/service";

const root = path.resolve(__dirname, "..");
const pkg = path.join(root, "assets/credentials/internship-v1");
const shared = path.join(root, "assets/credentials/foundation-v1");
const slots = {
  asset1: "CormorantGaramond-600.ttf",
  asset2: "InstrumentSans-400.ttf",
  asset3: "InstrumentSans-600.ttf",
  asset4: "signature-gagan-victor.png",
} as const;
const NAME = "Internship design v1";

async function main() {
  const email = process.env.ACTOR_EMAIL;
  if (!email) throw new Error("Set ACTOR_EMAIL to an individual ADMIN staff email.");
  const actor = await db.staffUser.findFirstOrThrow({ where: { email, role: "ADMIN", is_active: true } });
  const course = await db.course.findUniqueOrThrow({ where: { code: "INT" } });
  if (course.credential_type !== "INTERNSHIP_COMPLETION") throw new Error("Program INT is not an internship program.");

  const existing = await db.certificateTemplate.findFirst({ where: { course_id: course.id, name: NAME, status: { in: ["DRAFT", "ACTIVE"] } } });
  const template =
    existing ??
    (await (async () => {
      const bg = await uploadTemplateAsset(new Uint8Array(await readFile(path.join(pkg, "background.pdf"))), actor);
      const assets: Record<string, { path: string; sha256: string; mime: string }> = {};
      for (const [slot, file] of Object.entries(slots)) {
        assets[slot] = await uploadTemplateAsset(new Uint8Array(await readFile(path.join(shared, file))), actor);
      }
      const layout = JSON.parse(await readFile(path.join(pkg, "layout.json"), "utf8"));
      const resolved = resolveTemplateAssets(layout, assets) as { fieldConfig?: unknown; signatures?: unknown };
      return createTemplateVersion(
        {
          courseId: course.id,
          name: NAME,
          isProduction: true,
          background: { kind: "storage", path: bg.path, sha256: bg.sha256, mime: bg.mime },
          fieldConfig: resolved.fieldConfig,
          signatures: resolved.signatures ?? [],
          notes: "Course design (Foundation v1) adapted for internships; owner-approved 2026-10-04. Gagan Victor signature authorized.",
        },
        actor,
      );
    })());

  const pdf = await previewTemplate(template.id);
  const out = path.join(root, "output/pdf", `production-preview-internship-v${template.version}.pdf`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, pdf);

  let status = template.status;
  if (process.argv.includes("--activate") && template.status === "DRAFT") {
    status = (await activateTemplate(template.id, actor, defaultDeps())).status;
  }
  console.log({ reused: Boolean(existing), templateId: template.id, version: template.version, status, preview: out, bytes: pdf.byteLength });
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
