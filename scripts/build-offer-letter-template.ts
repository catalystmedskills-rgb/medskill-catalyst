/**
 * Offer letter template: the owner's sample (`MedSkills Offer Letter Template.pdf`,
 * 2026-10-12) rebuilt as artwork + layout + per-offer-type wording. Database-free.
 *   npx tsx --conditions=react-server scripts/build-offer-letter-template.ts
 * Writes assets/credentials/offer-letter-v1/{background.pdf,layout.json} and labelled
 * specimens in output/pdf/. Plan: docs/credentials/OFFER_LETTER_PLAN.md
 *
 * Coordinates are PDF points measured from the sample, top-left origin (converted below).
 * Deviations from the sample, both owner-approved: a "Scan to verify" QR under Ref/Date,
 * and a fifth Role details row (stipend), so the card is 20 pt taller and the text under
 * it 20 pt lower. Fonts: Instrument Sans 400/600 (fields), Inter Tight Italic (artwork).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { renderCertificate, type CertificateData } from "../src/modules/credentials/render";
import { fieldConfigSchema, missingRequiredFields, type FontRef, type OfferCopy, type TemplateSpec } from "../src/modules/credentials/template-config";
import { color, hash, labelPreview, loadLogo, root, SIGNATURE_PATH } from "./lib/certificate-artwork";

const dir = path.join(root, "assets/credentials/offer-letter-v1");
const output = path.join(root, "output/pdf");
export const W = 595.92, H = 841.92;
const NAVY = "#0A2A43", INK = "#0F1B27", BLUE = "#00589E", CYAN = "#4AD0FF", SLATE = "#5A6B7B";
const STIPEND_SHIFT = 20;

/** Owner-approved wording per offer type. Internship = the sample, word for word. */
export const OFFER_COPY: Record<"INTERNSHIP" | "CAMPUS_AMBASSADOR", OfferCopy> = {
  INTERNSHIP: {
    eyebrow: "INTERNSHIP OFFER",
    opening: "Congratulations. We are pleased to offer you {modeInternship} internship with MedSkills Catalyst in the role of **{role}**.",
    body: "Your interest in MedTech and the clarity you showed during our evaluation stood out. Over the internship you will work on live, task-based projects, receive structured feedback from industry mentors, and build evidence of your skills that you can show to future employers.",
    expect1: "Complete assigned tasks and milestones on time",
    expect2: "Attend weekly mentor reviews",
    expect3: "Maintain professional conduct and confidentiality",
    closing: "On successful completion you will receive a verified internship certificate and a letter of recommendation based on your performance.",
    signoff: "We look forward to working with you.",
  },
  // DRAFT for owner approval (2026-10-12), adapted from the internship letter.
  CAMPUS_AMBASSADOR: {
    eyebrow: "CAMPUS AMBASSADOR OFFER",
    opening: "Congratulations. We are pleased to offer you the role of **{role}** with MedSkills Catalyst{atInstitution}.",
    body: "Your interest in MedTech and the initiative you showed during our evaluation stood out. As an ambassador you will represent MedSkills Catalyst on your campus, help fellow students discover careers in MedTech, and work with our team on events and outreach.",
    expect1: "Represent MedSkills Catalyst professionally on campus",
    expect2: "Share programme updates and events with your peers",
    expect3: "Join regular check-ins with the MedSkills team",
    closing: "On successful completion of your tenure you will receive a verified certificate and a letter of recommendation based on your contribution.",
    signoff: "We look forward to working with you.",
  },
};

async function fonts() {
  return {
    regular: await readFile(path.join(root, "assets/fonts/InstrumentSans-400.ttf")),
    semibold: await readFile(path.join(root, "assets/fonts/InstrumentSans-600.ttf")),
    italic: await readFile(path.join(root, "assets/fonts/InterTight-400Italic.ttf")),
  };
}

function roundedRect(page: PDFPage, x: number, top: number, w: number, h: number, r: number, fill: string, border?: string) {
  const path = `M${r} 0 H${w - r} Q${w} 0 ${w} ${r} V${h - r} Q${w} ${h} ${w - r} ${h} H${r} Q0 ${h} 0 ${h - r} V${r} Q0 0 ${r} 0 Z`;
  page.drawSvgPath(path, { x, y: H - top, color: color(fill), ...(border ? { borderColor: color(border), borderWidth: 0.6 } : {}) });
}

async function drawLetterArtwork(): Promise<Uint8Array> {
  const f = await fonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(f.regular, { subset: true });
  const semibold = await doc.embedFont(f.semibold, { subset: true });
  // Embedded whole: pdf-lib subsetting drops this font's glyphs (renders blank).
  const italic = await doc.embedFont(f.italic, { subset: false });
  const logo = await doc.embedPng(await loadLogo());
  const page = doc.addPage([W, H]);
  const text = (value: string, x: number, baseline: number, size: number, font: PDFFont, ink: string, tracking = 0) => {
    if (!tracking) return page.drawText(value, { x, y: H - baseline, size, font, color: color(ink) });
    for (const ch of value) {
      page.drawText(ch, { x, y: H - baseline, size, font, color: color(ink) });
      x += font.widthOfTextAtSize(ch, size) + tracking * size;
    }
  };
  const rightText = (value: string, right: number, baseline: number, size: number, font: PDFFont, ink: string, tracking = 0) =>
    text(value, right - font.widthOfTextAtSize(value, size) - tracking * size * (value.length - 1), baseline, size, font, ink, tracking);

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
  // Soft light-blue glow, top right (the sample's gradient, approximated).
  for (const [r, o] of [[240, 0.05], [180, 0.06], [120, 0.07]] as const) page.drawCircle({ x: 575, y: H - 20, size: r, color: color("#DDF3FF"), opacity: o });
  // Top rule: navy, blue, cyan.
  page.drawRectangle({ x: 0, y: H - 6, width: 355, height: 6, color: color(NAVY) });
  page.drawRectangle({ x: 355, y: H - 6, width: 179, height: 6, color: color(BLUE) });
  page.drawRectangle({ x: 534, y: H - 6, width: W - 534, height: 6, color: color(CYAN) });

  // Letterhead.
  page.drawImage(logo, { x: 47.5, y: H - 87.5, width: 47, height: 47 });
  text("MedSkills Catalyst", 105, 59.5, 13, semibold, NAVY);
  text("Upskill to ", 105, 78, 9, regular, SLATE);
  text("upscale.", 105 + regular.widthOfTextAtSize("Upskill to ", 9), 78, 9, italic, BLUE);
  // "Ref:" / "Date:" are styled prefixes of their (right-aligned) fields, so any ID length fits.
  // QR caption (the QR itself is drawn by the renderer).
  rightText("Scan to verify", 547 - (60 - regular.widthOfTextAtSize("Scan to verify", 7)) / 2, 158, 7, regular, SLATE);

  // Eyebrow rule; heading.
  page.drawRectangle({ x: 47, y: H - 122.5, width: 30, height: 0.9, color: color(BLUE) });
  text("Offer ", 47, 174, 42, semibold, NAVY);
  text("letter.", 47 + semibold.widthOfTextAtSize("Offer ", 42), 174, 42, italic, BLUE);
  text("TO", 47, 217, 7.5, regular, SLATE, 0.2);

  // Role details card and "What we expect" card.
  const cardH = 148.5 + STIPEND_SHIFT;
  roundedRect(page, 47, 439.5, 243.5, cardH, 7, "#F6F8FA", "#E3E8EE");
  roundedRect(page, 303, 439.5, 244, cardH, 7, NAVY);
  text("ROLE DETAILS", 64, 465, 8, semibold, BLUE, 0.25);
  text("WHAT WE EXPECT", 320, 463.7, 8, semibold, CYAN, 0.25);
  ["Position", "Duration", "Mode", "Start date"].forEach((label, i) => text(label, 64, ROW_BASELINES[i], 9.5, regular, SLATE));
  // Check marks beside each expectation.
  for (const top of EXPECT_TOPS) {
    const cy = H - (top + 3.9);
    page.drawCircle({ x: 325.5, y: cy, size: 5.2, color: color("#16507A") });
    page.drawSvgPath("M0 0 L2 2 L5.2 -1.8", { x: 323.2, y: cy + 0.2, borderColor: color(CYAN), borderWidth: 1.1 });
  }

  // Signing line, signatory, seal.
  page.drawLine({ start: { x: 47, y: H - 736 }, end: { x: 182, y: H - 736 }, thickness: 0.6, color: color("#C8D0D8") });
  text("Gagan Victor", 47, 758, 10.5, semibold, NAVY);
  text("Founder, MedSkills Catalyst", 47, 778, 9, regular, SLATE);
  page.drawImage(logo, { x: 508 - 37, y: H - 744 - 37, width: 74, height: 74 });

  // Footer band.
  page.drawRectangle({ x: 0, y: 0, width: W, height: H - 804, color: color(NAVY) });
  text("medskillscatalyst.com", 47, 827, 9, regular, "#FFFFFF");
  rightText("UPSKILL TO UPSCALE", 546, 827, 8.5, semibold, CYAN, 0.2);

  doc.setTitle("Offer letter blank artwork v1");
  doc.setCreationDate(new Date("2026-10-12T00:00:00Z"));
  doc.setModificationDate(new Date("2026-10-12T00:00:00Z"));
  return doc.save();
}

const ROW_BASELINES = [491.5, 515.5, 539.5, 563.5, 587.5];
// Each expectation may take two lines, so they are evenly spaced (the sample assumed
// the second fits on one line); the stipend row made the card tall enough.
const EXPECT_TOPS = [481.4, 521.4, 561.4];
const SHIFTED = (top: number) => top + STIPEND_SHIFT;

/** A text box from a top-left position in points. */
function box(x: number, top: number, width: number, height: number, size: number, font: FontRef, options: Record<string, unknown> = {}) {
  return { x, y: H - top - height, width, height, size, minSize: Math.max(4, Math.round(size * 0.75 * 2) / 2), font, color: NAVY, align: "left", maxLines: 1, lineHeight: 1.15, prefix: "", ...options };
}

export async function buildOfferLetterPackage() {
  const background = await drawLetterArtwork();
  const f = await fonts();
  const assetFonts: Record<string, Uint8Array> = { asset1: f.regular, asset2: f.semibold };
  const ref = (id: string): FontRef => ({ kind: "asset", path: `asset:${id}`, sha256: hash(assetFonts[id]) });
  const R = ref("asset1"), B = ref("asset2");
  const para = (top: number, lines: number, size = 10.5) => box(47, top, 500, size + (lines - 1) * size * 1.75, size, R, { color: INK, lineHeight: 1.75, maxLines: lines, valign: "top", boldFont: B });
  const value = (i: number) => box(124, ROW_BASELINES[i] - 9.5 * 0.8 - 2, 160, 12, 9.5, B, { minSize: 7 });
  const expect = (top: number) => box(339, top, 193, 9.5 + 9.5 * 1.55, 9.5, R, { color: "#FFFFFF", lineHeight: 1.55, maxLines: 2, valign: "top" });

  const fieldConfig = fieldConfigSchema.parse({
    page: { width: W, height: H },
    fields: {
      certificate_id: box(330, 50.5, 217, 11, 9, B, { align: "right", minSize: 7, prefix: "Ref: ", prefixFont: R, prefixColor: SLATE }),
      issue_date: box(330, 68.5, 217, 11, 9, B, { align: "right", dateStyle: "dmy", prefix: "Date: ", prefixFont: R, prefixColor: SLATE }),
      offer_eyebrow: box(86, 117.5, 320, 11, 9, B, { color: BLUE, tracking: 0.25, minSize: 7 }),
      learner_name: box(47, 230, 420, 21, 17, B, { minSize: 11 }),
      recipient_institution: box(47, 259, 420, 13, 9.5, R, { color: SLATE, minSize: 7.5 }),
      offer_salutation: box(47, 296.5, 420, 12, 9.5, B, { color: INK }),
      offer_opening: para(323, 2),
      offer_body: para(367.6, 4),
      offer_role: value(0),
      offer_duration: value(1),
      offer_mode: value(2),
      offer_start_date: { ...value(3), dateStyle: "dmy" },
      offer_stipend_label: box(64, ROW_BASELINES[4] - 9.5 * 0.8 - 2, 58, 12, 9.5, R, { color: SLATE }),
      offer_stipend: value(4),
      offer_expect_1: expect(EXPECT_TOPS[0]),
      offer_expect_2: expect(EXPECT_TOPS[1]),
      offer_expect_3: expect(EXPECT_TOPS[2]),
      offer_closing: para(SHIFTED(610), 2),
      offer_signoff: box(47, SHIFTED(654.2), 500, 12, 10.5, B, { color: NAVY }),
    },
    qr: { x: 487, y: H - 148, size: 60, errorCorrection: "M", color: NAVY },
    copy: OFFER_COPY,
  });
  const missing = missingRequiredFields("OFFER_LETTER", fieldConfig);
  if (missing.length) throw new Error(`Offer letter layout is missing: ${missing.join(", ")}`);

  const sigBytes = await readFile(SIGNATURE_PATH);
  const sigImg = await (await PDFDocument.create()).embedPng(sigBytes);
  const sigH = 40, sigW = (sigH * sigImg.width) / sigImg.height;
  const sig = { label: "Gagan Victor", x: 50, y: H - 736 - 5, width: sigW, height: sigH };
  const layout = { fieldConfig, signatures: [{ ...sig, image: "asset:asset4" }] };
  const spec: TemplateSpec = {
    fieldConfig,
    signatures: [{ ...sig, image: { path: "signature", sha256: hash(sigBytes), mime: "image/png" } }],
    background: { kind: "storage", path: "background.pdf", sha256: hash(background), mime: "application/pdf" },
  };
  const loader = async (key: string) => (key === "background.pdf" ? background : key === "signature" ? sigBytes : assetFonts[key.replace("asset:", "")]);
  return { background, layout, spec, loader };
}

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const base = { programName: "MedSkills Offer Letters", completionDate: d("2026-10-12"), issueDate: d("2026-10-12"), expiresOn: null, verifyUrl: "https://www.medskillscatalyst.com/verify/PREVIEWxxxxxxxxxxxxxxx" };
export const OFFER_SPECIMENS: [string, CertificateData][] = [
  ["offer-letter-intern-specimen.pdf", {
    ...base, learnerName: "Sejal Sanjay Khapare", certificateId: "MSC-2026-OFR-PREV23",
    offer: { offerType: "INTERNSHIP", role: "MedTech Sales Intern", institution: "K.K. Wagh College of Pharmacy, Nashik", startDate: d("2026-10-15"), duration: "2 Months", mode: "Remote", modeInternship: "a virtual", stipend: null, greetingName: "Sejal" },
  }],
  ["offer-letter-ambassador-specimen.pdf", {
    ...base, learnerName: "Rohan Deshmukh", certificateId: "MSC-2026-OFR-PREV24",
    offer: { offerType: "CAMPUS_AMBASSADOR", role: "Campus Ambassador", institution: "Bharati Vidyapeeth College of Pharmacy, Pune", startDate: d("2026-11-01"), duration: "6 Months", mode: "Hybrid", modeInternship: "a hybrid", stipend: "INR 2,000 per month", greetingName: "Rohan" },
  }],
  ["offer-letter-long-specimen.pdf", {
    ...base, learnerName: "Dr. Aanya Venkataraman-Krishnaswamy", certificateId: "MSC-2026-OFFERLETTR-PREV25",
    offer: { offerType: "INTERNSHIP", role: "Regulatory Affairs & Quality Intern", institution: "Manipal College of Pharmaceutical Sciences, Manipal Academy of Higher Education", startDate: d("2026-12-31"), duration: "12 Weeks", mode: "On-site", modeInternship: "an on-site", stipend: "INR 12,500 per month", greetingName: "Aanya" },
  }],
];

async function main() {
  await mkdir(dir, { recursive: true });
  await mkdir(output, { recursive: true });
  const pkg = await buildOfferLetterPackage();
  await writeFile(path.join(dir, "background.pdf"), pkg.background);
  await writeFile(path.join(dir, "layout.json"), JSON.stringify(pkg.layout, null, 2) + "\n");
  for (const [file, data] of OFFER_SPECIMENS) {
    const out = await renderCertificate(pkg.spec, data, pkg.loader);
    await writeFile(path.join(output, file), await labelPreview(out.bytes));
  }
  console.log(`Created offer letter background + layout and ${OFFER_SPECIMENS.length} labelled specimens.`);
}

if (typeof require !== "undefined" && require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
