/** Database-free artwork builder. Run: npx tsx scripts/build-foundation-template.ts */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { renderCertificate } from "../src/modules/credentials/render";
import { fieldConfigSchema, type FontRef, type TemplateSpec } from "../src/modules/credentials/template-config";
import { box, drawArtwork, H, hash, labelPreview, root, S, signatureBlock, W } from "./lib/certificate-artwork";

const dir = path.join(root, "assets/credentials/foundation-v1");
const output = path.join(root, "output/pdf");

async function main() {
  await mkdir(dir, { recursive: true });
  await mkdir(output, { recursive: true });
  const serifBytes = await readFile(path.join(dir, "CormorantGaramond-600.ttf"));
  const bodyBytes = await readFile(path.join(root, "assets/fonts/InstrumentSans-400.ttf"));
  const boldBytes = await readFile(path.join(root, "assets/fonts/InstrumentSans-600.ttf"));
  await writeFile(path.join(dir, "InstrumentSans-400.ttf"), bodyBytes);
  await writeFile(path.join(dir, "InstrumentSans-600.ttf"), boldBytes);
  // The live course design: exact ribbon positions kept so the output is byte-identical.
  const background = await drawArtwork({
    ribbon: [{ text: "COURSE", x: 916, baseline: 74 }, { text: "CERTIFICATE", x: 901, baseline: 94 }],
    subline: "For successfully completing the online course",
    title: "Foundation certificate blank artwork v1",
  });
  await writeFile(path.join(dir, "background.pdf"), background);

  const fonts: Record<string, { bytes: Uint8Array; filename: string }> = {
    asset1: { bytes: serifBytes, filename: "CormorantGaramond-600.ttf" },
    asset2: { bytes: bodyBytes, filename: "InstrumentSans-400.ttf" },
    asset3: { bytes: boldBytes, filename: "InstrumentSans-600.ttf" },
  };
  const ref = (id: string): FontRef => ({ kind: "asset", path: `asset:${id}`, sha256: hash(fonts[id].bytes) });
  const fieldConfig = fieldConfigSchema.parse({
    page: { width: W, height: H },
    fields: {
      learner_name: box(78, 377, 710, 72, 56, ref("asset1"), { maxLines: 2 }),
      program_name: box(78, 492, 710, 54, 26, ref("asset3"), { maxLines: 2 }),
      completion_date: box(78, 557, 620, 22, 15, ref("asset2"), { prefix: "Course completed on ", color: "#5A6B7B" }),
      issue_date: box(78, 585, 300, 18, 12, ref("asset2"), { prefix: "Issued on ", color: "#5A6B7B" }),
      expiry_date: box(390, 585, 300, 18, 12, ref("asset2"), { prefix: "Valid until ", color: "#5A6B7B" }),
      certificate_id: box(570, 708, 365, 18, 12, ref("asset2"), { align: "right", prefix: "ID · " }),
      verify_url: box(570, 659, 365, 42, 12, ref("asset2"), { align: "right", maxLines: 2, color: "#00589E" }),
    },
    qr: { x: 950 * S, y: H - 730 * S, size: 84 * S, errorCorrection: "M", color: "#0A2A43" },
  });
  // Gagan Victor's approved signature (owner-supplied 2026-09-27). Upload form: slot asset4.
  const sig = await signatureBlock();
  const layout = { fieldConfig, signatures: [{ ...sig.block, image: "asset:asset4" }] };
  await writeFile(path.join(dir, "layout.json"), JSON.stringify(layout, null, 2) + "\n");
  const spec: TemplateSpec = {
    fieldConfig,
    signatures: [{ ...sig.block, image: { path: "signature-gagan-victor.png", sha256: hash(sig.bytes), mime: "image/png" } }],
    background: { kind: "storage", path: "background.pdf", sha256: hash(background), mime: "application/pdf" },
  };
  const loader = async (key: string) => key === "background.pdf" ? background : key === "signature-gagan-victor.png" ? sig.bytes : fonts[key.replace("asset:", "")].bytes;
  for (const [name, filename] of [["Sample Learner", "foundation-specimen.pdf"], ["Dr. Aanya Venkataraman-Krishnaswamy", "foundation-long-name-specimen.pdf"]]) {
    const result = await renderCertificate(spec, { learnerName: name, programName: "Foundation Module", completionDate: new Date("2026-09-26T00:00:00Z"), issueDate: new Date("2026-09-27T00:00:00Z"), expiresOn: null, certificateId: "MSC-2026-PREV-234567", verifyUrl: "https://medskillscatalyst.com/verify/PREVIEWxxxxxxxxxxxxxxx" }, loader);
    await writeFile(path.join(output, filename), await labelPreview(result.bytes));
  }
  console.log("Created Foundation background, upload layout/fonts and two labelled specimens.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
