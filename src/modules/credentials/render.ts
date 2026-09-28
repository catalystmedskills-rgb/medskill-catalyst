import { PDFDocument, rgb, degrees, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import { createHash } from "node:crypto";
import { formatLongDate } from "./dates";
import { ISSUER_NAME } from "./config";
import { fitText } from "./text-fit";
import type { FieldKey, FontRef, TemplateSpec, TextBox } from "./template-config";

export type CertificateData = {
  learnerName: string;
  programName: string;
  completionDate: Date;
  issueDate: Date;
  expiresOn: Date | null;
  certificateId: string;
  verifyUrl: string;
};

/** Loads a template asset by storage key. The renderer verifies its sha256. */
export type AssetLoader = (path: string) => Promise<Uint8Array>;

export type PreflightIssue = { field: FieldKey | "template"; message: string };

export class RenderError extends Error {
  constructor(public issues: PreflightIssue[]) {
    super(issues.map((i) => `${i.field}: ${i.message}`).join("; "));
  }
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

function hexColor(h: string) {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function fieldValue(key: FieldKey, d: CertificateData): string | null {
  switch (key) {
    case "learner_name":
      return d.learnerName;
    case "program_name":
      return d.programName;
    case "completion_date":
      return formatLongDate(d.completionDate);
    case "issue_date":
      return formatLongDate(d.issueDate);
    case "expiry_date":
      return d.expiresOn ? formatLongDate(d.expiresOn) : null;
    case "certificate_id":
      return d.certificateId;
    case "verify_url":
      return d.verifyUrl.replace(/^https?:\/\//, "");
  }
}

async function loadVerified(loader: AssetLoader, ref: { path: string; sha256: string }): Promise<Uint8Array> {
  const bytes = await loader(ref.path);
  if (sha256(bytes) !== ref.sha256) throw new RenderError([{ field: "template", message: `asset ${ref.path} failed integrity check` }]);
  return bytes;
}

class FontCache {
  private cache = new Map<string, PDFFont>();
  constructor(private doc: PDFDocument, private loader: AssetLoader) {}
  async get(ref: FontRef): Promise<PDFFont> {
    const key = ref.kind === "standard" ? `std:${ref.name}` : `asset:${ref.sha256}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const font =
      ref.kind === "standard"
        ? await this.doc.embedFont(ref.name as StandardFonts)
        : await this.doc.embedFont(await loadVerified(this.loader, ref), { subset: true });
    this.cache.set(key, font);
    return font;
  }
}

type Layout = { lines: string[]; size: number; font: PDFFont; box: TextBox };

/** Lay out one text box; returns issues instead of throwing so preflight can report all of them. */
async function layout(fonts: FontCache, box: TextBox, text: string, field: FieldKey | "template"): Promise<Layout | PreflightIssue> {
  const font = await fonts.get(box.font);
  const full = box.prefix + text;
  // Custom fonts can silently map unsupported code points to .notdef rather
  // than throwing from encodeText. Block issuance instead of printing boxes.
  const supported = new Set(font.getCharacterSet());
  if ([...full].some((character) => !/\s/.test(character) && !supported.has(character.codePointAt(0)!))) {
    return { field, message: "contains characters the template font cannot print" };
  }
  try {
    font.encodeText(full); // standard fonts only cover WinAnsi; catch unsupported characters early
  } catch {
    return { field: field as FieldKey, message: "contains characters the template font cannot print" };
  }
  const fit = fitText(full, font, box);
  if (!fit.ok) return { field: field as FieldKey, message: `text is too long for the certificate (${fit.reason})` };
  return { lines: fit.lines, size: fit.size, font, box };
}

function drawLayout(page: PDFPage, l: Layout) {
  const { box } = l;
  const lineGap = l.size * box.lineHeight;
  const blockHeight = l.size + (l.lines.length - 1) * lineGap;
  // Vertically centre the block in its box; baseline of first line.
  let baseline = box.y + (box.height + blockHeight) / 2 - l.size * 0.8;
  for (const line of l.lines) {
    const w = l.font.widthOfTextAtSize(line, l.size);
    const x = box.align === "center" ? box.x + (box.width - w) / 2 : box.align === "right" ? box.x + box.width - w : box.x;
    page.drawText(line, { x, y: baseline, size: l.size, font: l.font, color: hexColor(box.color) });
    baseline -= lineGap;
  }
}

/** Vector QR: one rectangle per horizontal run of dark modules, 4-module quiet zone. */
export function drawQr(page: PDFPage, text: string, box: { x: number; y: number; size: number; errorCorrection: "M" | "Q" | "H"; color: string }) {
  const qr = QRCode.create(text, { errorCorrectionLevel: box.errorCorrection });
  const n = qr.modules.size;
  const quiet = 4;
  const unit = box.size / (n + quiet * 2);
  page.drawRectangle({ x: box.x, y: box.y, width: box.size, height: box.size, color: rgb(1, 1, 1) });
  const color = hexColor(box.color);
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.modules.get(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < n && qr.modules.get(r, c)) c++;
      page.drawRectangle({
        x: box.x + (quiet + start) * unit,
        y: box.y + box.size - (quiet + r + 1) * unit,
        width: (c - start) * unit,
        height: unit,
        color,
      });
    }
  }
  return { modules: n, moduleSizePt: unit };
}

async function drawDevBackground(doc: PDFDocument, page: PDFPage) {
  const { width, height } = page.getSize();
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = hexColor("#0A2A43");
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: navy, borderWidth: 1 });
  page.drawRectangle({ x: 0, y: height - 22, width, height: 22, color: hexColor("#B42318") });
  page.drawText("DEVELOPMENT TEMPLATE  ·  NOT A VALID CREDENTIAL  ·  NON-PRODUCTION", {
    x: 70, y: height - 15, size: 9, font: sansBold, color: rgb(1, 1, 1),
  });
  page.drawText(ISSUER_NAME.toUpperCase(), { x: 70, y: height - 80, size: 11, font: sansBold, color: hexColor("#00589E") });
  page.drawText("CERTIFICATE OF COMPLETION", { x: 70, y: height - 130, size: 30, font: serif, color: navy });
  page.drawText("Presented to", { x: 70, y: 372, size: 11, font: sans, color: hexColor("#5A6B7B") });
  page.drawText("For successfully completing", { x: 70, y: 272, size: 11, font: sans, color: hexColor("#5A6B7B") });
  page.drawText("SPECIMEN", {
    x: width / 2 - 170, y: height / 2 - 120, size: 90, font: sansBold, color: hexColor("#B42318"), opacity: 0.08, rotate: degrees(25),
  });
  page.drawText("Scan to verify", { x: 718, y: 40, size: 7, font: sans, color: hexColor("#5A6B7B") });
}

async function drawStorageBackground(doc: PDFDocument, page: PDFPage, spec: TemplateSpec, loader: AssetLoader) {
  const bg = spec.background;
  if (bg.kind !== "storage") return;
  const bytes = await loadVerified(loader, bg);
  const { width, height } = page.getSize();
  if (bg.mime === "application/pdf") {
    const [embedded] = await doc.embedPdf(bytes, [0]);
    page.drawPage(embedded, { x: 0, y: 0, width, height });
  } else {
    const img = bg.mime === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    page.drawImage(img, { x: 0, y: 0, width, height });
  }
}

const FIELD_ORDER: FieldKey[] = [
  "learner_name",
  "program_name",
  "completion_date",
  "issue_date",
  "expiry_date",
  "certificate_id",
  "verify_url",
];

async function build(spec: TemplateSpec, data: CertificateData, loader: AssetLoader, draw: boolean) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([spec.fieldConfig.page.width, spec.fieldConfig.page.height]);
  const fonts = new FontCache(doc, loader);
  const issues: PreflightIssue[] = [];
  const layouts: Layout[] = [];

  for (const key of FIELD_ORDER) {
    const box = spec.fieldConfig.fields[key];
    if (!box) continue;
    const value = fieldValue(key, data);
    if (value === null) continue;
    const l = await layout(fonts, box, value, key);
    if ("message" in l) issues.push(l);
    else layouts.push(l);
  }
  for (const sig of spec.signatures) {
    for (const part of [sig.name, sig.title]) {
      if (!part) continue;
      const l = await layout(fonts, part.box, part.text, "template");
      if ("message" in l) issues.push({ field: "template", message: `signature "${sig.label}": ${l.message}` });
      else layouts.push(l);
    }
  }
  if (issues.length) throw new RenderError(issues);
  if (!draw) return null;

  if (spec.background.kind === "builtin-dev") await drawDevBackground(doc, page);
  else await drawStorageBackground(doc, page, spec, loader);

  for (const sig of spec.signatures) {
    const bytes = await loadVerified(loader, sig.image);
    const img = sig.image.mime === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    page.drawImage(img, { x: sig.x, y: sig.y, width: sig.width, height: sig.height });
  }
  for (const l of layouts) drawLayout(page, l);
  const qr = drawQr(page, data.verifyUrl, spec.fieldConfig.qr);

  // Deterministic metadata: the same credential renders to the same bytes.
  doc.setTitle(`${ISSUER_NAME} Certificate ${data.certificateId}`);
  doc.setAuthor(ISSUER_NAME);
  doc.setSubject(`Verify at ${data.verifyUrl}`);
  doc.setCreator(`${ISSUER_NAME} Credential Registry`);
  doc.setProducer(`${ISSUER_NAME} Credential Registry`);
  doc.setKeywords([data.certificateId]);
  doc.setCreationDate(data.issueDate);
  doc.setModificationDate(data.issueDate);
  const bytes = await doc.save({ useObjectStreams: true });
  return { bytes, sha256: sha256(bytes), qr };
}

/** Validate that every field fits and prints, without producing a file. */
export async function preflightCertificate(spec: TemplateSpec, data: CertificateData, loader: AssetLoader): Promise<PreflightIssue[]> {
  try {
    await build(spec, data, loader, false);
    return [];
  } catch (e) {
    if (e instanceof RenderError) return e.issues;
    throw e;
  }
}

export async function renderCertificate(spec: TemplateSpec, data: CertificateData, loader: AssetLoader) {
  const out = await build(spec, data, loader, true);
  return out!;
}
