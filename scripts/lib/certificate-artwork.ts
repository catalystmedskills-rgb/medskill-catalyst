/**
 * The MedSkills Catalyst certificate artwork (Foundation design v1), shared by every
 * credential type so the course and internship certificates cannot drift apart.
 * Only the words that must differ are parameters. Database-free; used by
 * scripts/build-foundation-template.ts and scripts/build-internship-template.ts.
 *
 * Coordinates are design px on the 1123 × 794 source page (S converts to PDF points).
 * Output is deterministic: rebuilding the course variant reproduces the live
 * background.pdf byte for byte (sha256 10358b53…).
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { PDFDocument, rgb, degrees, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { FontRef } from "../../src/modules/credentials/template-config";

export const root = path.resolve(__dirname, "../..");
export const W = 842.25, H = 595.5, S = 0.75;
export const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export const color = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
const navy = color("#0A2A43"), blue = color("#00589E"), cyan = color("#4AD0FF"), slate = color("#5A6B7B");

/** The approved signature lives once, in the Foundation package. Never copy it. */
export const SIGNATURE_PATH = path.join(root, "assets/credentials/foundation-v1/signature-gagan-victor.png");

export type ArtworkVariant = {
  /** Ribbon lines. `x` omitted = centred in the ribbon. */
  ribbon: { text: string; x?: number; baseline: number }[];
  /** The line between the learner's name and the prominent line. */
  subline: string;
  title: string;
};

export async function loadFonts() {
  return {
    serif: await readFile(path.join(root, "assets/credentials/foundation-v1/CormorantGaramond-600.ttf")),
    body: await readFile(path.join(root, "assets/fonts/InstrumentSans-400.ttf")),
    bold: await readFile(path.join(root, "assets/fonts/InstrumentSans-600.ttf")),
  };
}

/** The MedSkills Catalyst seal/logo PNG bundled with the approved certificate design. */
export async function loadLogo(): Promise<Uint8Array> {
  const html = await readFile(path.join(root, "public/certificate/foundation.html"), "utf8");
  const manifest = JSON.parse(html.match(/<script type="__bundler\/manifest">\s*([\s\S]*?)<\/script>/)![1]);
  return Buffer.from(manifest["f16ac5c5-9b30-4ff4-8620-052e2d6b3365"].data, "base64");
}

export async function drawArtwork(variant: ArtworkVariant): Promise<Uint8Array> {
  const logoBytes = await loadLogo();
  const fonts = await loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const serif = await doc.embedFont(fonts.serif, { subset: true });
  const body = await doc.embedFont(fonts.body, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
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
  for (const line of variant.ribbon) {
    const x = line.x ?? 944 - bold.widthOfTextAtSize(line.text, 12 * S) / S / 2; // ribbon centre is x 944
    text(line.text, x, line.baseline, 12, bold, rgb(1, 1, 1));
  }
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
  text(variant.subline, 78, 479, 16, body, slate);
  // The signature image is a template signature block, not artwork.
  page.drawLine({ start: { x: 78 * S, y: H - 674 * S }, end: { x: 328 * S, y: H - 674 * S }, thickness: 0.6, color: slate });
  text("Gagan Victor", 78, 699, 16, bold);
  text("Academic Director, MedSkills Catalyst", 78, 721, 13, body, slate);
  text("SCAN TO VERIFY", 950, 641, 10, bold);
  doc.setTitle(variant.title);
  doc.setCreationDate(new Date("2026-09-27T00:00:00Z"));
  doc.setModificationDate(new Date("2026-09-27T00:00:00Z"));
  return doc.save();
}

/** A text box in design px (top-left origin) → template-config points (bottom-left origin). */
export function box(x: number, top: number, width: number, height: number, size: number, font: FontRef, options: Record<string, unknown> = {}) {
  return { x: x * S, y: H - (top + height) * S, width: width * S, height: height * S, size: size * S, minSize: size * S * 0.6, font, color: "#0A2A43", align: "left", maxLines: 1, lineHeight: 1.1, prefix: "", ...options };
}

/** Signature block: approved image above the signing line, aspect ratio preserved. */
export async function signatureBlock() {
  const bytes = await readFile(SIGNATURE_PATH);
  const img = await (await PDFDocument.create()).embedPng(bytes);
  const height = 54, width = height * img.width / img.height;
  return { bytes, block: { label: "Gagan Victor", x: 78 * S, y: H - 674 * S - 6, width, height } };
}

export const PREVIEW_LABEL = "DESIGN PREVIEW - NOT AN ISSUED CREDENTIAL";
export async function labelPreview(bytes: Uint8Array) {
  const preview = await PDFDocument.load(bytes);
  preview.getPage(0).drawText(PREVIEW_LABEL, { x: 225, y: 7, size: 8, color: color("#B42318") });
  return preview.save();
}
