/** Database-free artwork builder. Run: npx tsx scripts/build-foundation-template.ts */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { PDFDocument, rgb, degrees, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { renderCertificate } from "../src/modules/credentials/render";
import { fieldConfigSchema, type FontRef, type TemplateSpec } from "../src/modules/credentials/template-config";

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "assets/credentials/foundation-v1");
const output = path.join(root, "output/pdf");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const color = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
const navy = color("#0A2A43"), blue = color("#00589E"), cyan = color("#4AD0FF"), slate = color("#5A6B7B");
const W = 842.25, H = 595.5, S = 0.75;

async function main() {
  await mkdir(dir, { recursive: true });
  await mkdir(output, { recursive: true });
  const html = await readFile(path.join(root, "public/certificate/foundation.html"), "utf8");
  const manifest = JSON.parse(html.match(/<script type="__bundler\/manifest">\s*([\s\S]*?)<\/script>/)![1]);
  const logoBytes = Buffer.from(manifest["f16ac5c5-9b30-4ff4-8620-052e2d6b3365"].data, "base64");
  const serifBytes = await readFile(path.join(dir, "CormorantGaramond-600.ttf"));
  const bodyBytes = await readFile(path.join(root, "assets/fonts/InstrumentSans-400.ttf"));
  const boldBytes = await readFile(path.join(root, "assets/fonts/InstrumentSans-600.ttf"));
  await writeFile(path.join(dir, "InstrumentSans-400.ttf"), bodyBytes);
  await writeFile(path.join(dir, "InstrumentSans-600.ttf"), boldBytes);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const serif = await doc.embedFont(serifBytes, { subset: true });
  const body = await doc.embedFont(bodyBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  const logo = await doc.embedPng(logoBytes);
  const page = doc.addPage([W, H]);
  const rect = (x: number, y: number, width: number, height: number, fill: ReturnType<typeof rgb>) => page.drawRectangle({ x: x * S, y: H - (y + height) * S, width: width * S, height: height * S, color: fill });
  const text = (value: string, x: number, baseline: number, size: number, font: PDFFont = body, ink = navy) => page.drawText(value, { x: x * S, y: H - baseline * S, size: size * S, font, color: ink });
  rect(0, 0, 1123, 794, rgb(1, 1, 1));
  page.drawImage(logo, { x: (1123 - 520) / 2 * S, y: (794 - 520) / 2 * S, width: 520 * S, height: 520 * S, opacity: 0.05 });
  for (const [inset, thickness, ink] of [[26, 1.5, navy], [33, 0.75, blue]] as const) {
    page.drawRectangle({ x: inset * S, y: inset * S, width: W - 2 * inset * S, height: H - 2 * inset * S, borderColor: ink, borderWidth: thickness * S });
  }
  // Ribbon and seal follow the source design, in vector form.
  page.drawSvgPath("M0 0 L118 0 L118 560 L59 504 L0 560 Z", { x: 885 * S, y: H - 26 * S, scale: S, color: navy });
  text("COURSE", 916, 74, 12, bold, rgb(1, 1, 1));
  text("CERTIFICATE", 901, 94, 12, bold, rgb(1, 1, 1));
  rect(929, 108, 30, 2, cyan);
  const cx = 944 * S, cy = H - 405 * S;
  page.drawCircle({ x: cx, y: cy, size: 88 * S, color: rgb(1, 1, 1), borderColor: navy, borderWidth: 1.5 });
  page.drawCircle({ x: cx, y: cy, size: 81 * S, borderColor: blue, borderWidth: 0.6 });
  const arc = (value: string, top: boolean) => {
    [...value].forEach((ch, i) => {
      const angle = top ? 140 - i * 100 / (value.length - 1) : 220 + i * 100 / (value.length - 1);
      const radians = angle * Math.PI / 180, size = (top ? 14 : 11) * S;
      page.drawText(ch, { x: cx + 67 * S * Math.cos(radians) - bold.widthOfTextAtSize(ch, size) / 2, y: cy + 67 * S * Math.sin(radians), size, font: bold, color: navy, rotate: degrees(top ? angle - 90 : angle + 90) });
    });
  };
  arc("VERIFIED", true); arc("CREDENTIAL", false);
  page.drawCircle({ x: cx, y: cy, size: 40 * S, color: navy });
  page.drawCircle({ x: cx, y: cy, size: 34 * S, borderColor: cyan, borderWidth: 0.7 });
  page.drawSvgPath("M0 0 L12 12 L36 -14", { x: cx - 18 * S, y: cy, scale: S, borderColor: cyan, borderWidth: 4 });
  page.drawImage(logo, { x: 70 * S, y: H - 186 * S, width: 116 * S, height: 116 * S });
  text("CERTIFICATE", 78, 246, 54, serif);
  text("OF COMPLETION", 78, 300, 54, serif);
  rect(78, 318, 66, 3, blue);
  text("Presented to", 78, 365, 15, body, slate);
  text("For successfully completing the online course", 78, 479, 16, body, slate);
  // The signature image is a template signature block (below), not artwork.
  page.drawLine({ start: { x: 78 * S, y: H - 674 * S }, end: { x: 328 * S, y: H - 674 * S }, thickness: 0.6, color: slate });
  text("Gagan Victor", 78, 699, 16, bold);
  text("Academic Director, MedSkills Catalyst", 78, 721, 13, body, slate);
  text("SCAN TO VERIFY", 950, 641, 10, bold);
  doc.setTitle("Foundation certificate blank artwork v1");
  doc.setCreationDate(new Date("2026-09-27T00:00:00Z"));
  doc.setModificationDate(new Date("2026-09-27T00:00:00Z"));
  const background = await doc.save();
  await writeFile(path.join(dir, "background.pdf"), background);

  const fonts: Record<string, { bytes: Uint8Array; filename: string }> = {
    asset1: { bytes: serifBytes, filename: "CormorantGaramond-600.ttf" },
    asset2: { bytes: bodyBytes, filename: "InstrumentSans-400.ttf" },
    asset3: { bytes: boldBytes, filename: "InstrumentSans-600.ttf" },
  };
  const ref = (id: string): FontRef => ({ kind: "asset", path: `asset:${id}`, sha256: hash(fonts[id].bytes) });
  const box = (x: number, top: number, width: number, height: number, size: number, font: FontRef, options = {}) => ({ x: x * S, y: H - (top + height) * S, width: width * S, height: height * S, size: size * S, minSize: size * S * 0.6, font, color: "#0A2A43", align: "left", maxLines: 1, lineHeight: 1.1, prefix: "", ...options });
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
  // Gagan Victor's approved signature (owner-supplied 2026-09-27), above the signing
  // line; aspect ratio preserved, the lower flourish dips just below the line.
  const signatureBytes = await readFile(path.join(dir, "signature-gagan-victor.png"));
  const sigImage = await (await PDFDocument.create()).embedPng(signatureBytes);
  const sigHeight = 54, sigWidth = sigHeight * sigImage.width / sigImage.height;
  const signature = { label: "Gagan Victor", x: 78 * S, y: H - 674 * S - 6, width: sigWidth, height: sigHeight };
  // Upload form: the signature PNG goes in slot asset4.
  const layout = { fieldConfig, signatures: [{ ...signature, image: "asset:asset4" }] };
  await writeFile(path.join(dir, "layout.json"), JSON.stringify(layout, null, 2) + "\n");
  const spec: TemplateSpec = {
    fieldConfig,
    signatures: [{ ...signature, image: { path: "signature-gagan-victor.png", sha256: hash(signatureBytes), mime: "image/png" } }],
    background: { kind: "storage", path: "background.pdf", sha256: hash(background), mime: "application/pdf" },
  };
  const loader = async (key: string) => key === "background.pdf" ? background : key === "signature-gagan-victor.png" ? signatureBytes : fonts[key.replace("asset:", "")].bytes;
  for (const [name, filename] of [["Sample Learner", "foundation-specimen.pdf"], ["Dr. Aanya Venkataraman-Krishnaswamy", "foundation-long-name-specimen.pdf"]]) {
    const result = await renderCertificate(spec, { learnerName: name, programName: "Foundation Module", completionDate: new Date("2026-09-26T00:00:00Z"), issueDate: new Date("2026-09-27T00:00:00Z"), expiresOn: null, certificateId: "MSC-2026-PREV-234567", verifyUrl: "https://medskillscatalyst.com/verify/PREVIEWxxxxxxxxxxxxxxx" }, loader);
    const preview = await PDFDocument.load(result.bytes);
    preview.getPage(0).drawText("DESIGN PREVIEW - NOT AN ISSUED CREDENTIAL", { x: 225, y: 7, size: 8, color: color("#B42318") });
    await writeFile(path.join(output, filename), await preview.save());
  }
  console.log("Created Foundation background, upload layout/fonts and two labelled specimens.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
