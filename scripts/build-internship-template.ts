/**
 * Internship completion certificate: the live course design (Foundation design v1)
 * with only the words that must differ. Database-free.
 *   npx tsx --conditions=react-server scripts/build-internship-template.ts
 * Writes assets/credentials/internship-v1/{background.pdf,layout.json} and labelled
 * specimens in output/pdf/. Fonts and the signature are NOT copied: upload them from
 * foundation-v1 (see the package README). Plan: docs/credentials/INTERNSHIP_TEMPLATE_PLAN.md
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { renderCertificate, type CertificateData } from "../src/modules/credentials/render";
import { fieldConfigSchema, missingRequiredFields, type FontRef, type TemplateSpec } from "../src/modules/credentials/template-config";
import { box, drawArtwork, H, hash, labelPreview, loadFonts, root, S, signatureBlock, W } from "./lib/certificate-artwork";

const dir = path.join(root, "assets/credentials/internship-v1");
const output = path.join(root, "output/pdf");
const SLATE = "#5A6B7B";

export async function buildInternshipPackage() {
  const background = await drawArtwork({
    ribbon: [{ text: "INTERNSHIP", baseline: 74 }, { text: "CERTIFICATE", baseline: 94 }],
    subline: "For successfully completing the internship",
    title: "Internship certificate blank artwork v1",
  });
  const f = await loadFonts();
  const fonts: Record<string, Uint8Array> = { asset1: f.serif, asset2: f.body, asset3: f.bold };
  const ref = (id: string): FontRef => ({ kind: "asset", path: `asset:${id}`, sha256: hash(fonts[id]) });
  const fieldConfig = fieldConfigSchema.parse({
    page: { width: W, height: H },
    fields: {
      learner_name: box(78, 377, 710, 72, 56, ref("asset1"), { maxLines: 2 }),
      // The typed internship name takes the course's program slot: same type, one line.
      internship_title: box(78, 492, 710, 34, 26, ref("asset3")),
      department: box(78, 528, 620, 18, 12, ref("asset2"), { prefix: "Department: ", color: SLATE }),
      internship_period: box(78, 557, 330, 22, 15, ref("asset2"), { color: SLATE }),
      // Second column at x 420: duration over hours, clear of the longest date range.
      duration: box(420, 557, 280, 22, 15, ref("asset3")),
      issue_date: box(78, 585, 330, 18, 12, ref("asset2"), { prefix: "Issued on ", color: SLATE }),
      total_hours: box(420, 585, 280, 18, 12, ref("asset2"), { prefix: "Total ", color: SLATE }),
      certificate_id: box(570, 708, 365, 18, 12, ref("asset2"), { align: "right", prefix: "ID · " }),
      verify_url: box(570, 659, 365, 42, 12, ref("asset2"), { align: "right", maxLines: 2, color: "#00589E" }),
    },
    qr: { x: 950 * S, y: H - 730 * S, size: 84 * S, errorCorrection: "M", color: "#0A2A43" },
  });
  const missing = missingRequiredFields("INTERNSHIP_COMPLETION", fieldConfig);
  if (missing.length) throw new Error(`Internship layout is missing: ${missing.join(", ")}`);
  const sig = await signatureBlock();
  const layout = { fieldConfig, signatures: [{ ...sig.block, image: "asset:asset4" }] };
  const spec: TemplateSpec = {
    fieldConfig,
    signatures: [{ ...sig.block, image: { path: "signature", sha256: hash(sig.bytes), mime: "image/png" } }],
    background: { kind: "storage", path: "background.pdf", sha256: hash(background), mime: "application/pdf" },
  };
  const loader = async (key: string) => (key === "background.pdf" ? background : key === "signature" ? sig.bytes : fonts[key.replace("asset:", "")]);
  return { background, layout, spec, loader };
}

const d = (s: string) => new Date(`${s}T00:00:00Z`);
export const SPECIMENS: [string, CertificateData][] = [
  ["internship-specimen.pdf", {
    learnerName: "Sample Learner", programName: "MedSkills Internship Program", completionDate: d("2026-08-31"), issueDate: d("2026-10-04"), expiresOn: null,
    certificateId: "MSC-2026-INT-PREV23", verifyUrl: "https://www.medskillscatalyst.com/verify/PREVIEWxxxxxxxxxxxxxxx",
    internship: { title: "Clinical Research Internship", department: "Clinical Operations", startDate: d("2026-06-01"), endDate: d("2026-08-31"), duration: "3 Months", totalHours: 480 },
  }],
  ["internship-long-specimen.pdf", {
    learnerName: "Dr. Aanya Venkataraman-Krishnaswamy", programName: "MedSkills Internship Program", completionDate: d("2026-12-31"), issueDate: d("2026-10-04"), expiresOn: null,
    certificateId: "MSC-2026-INT-PREV24", verifyUrl: "https://www.medskillscatalyst.com/verify/PREVIEWxxxxxxxxxxxxxxx",
    internship: { title: "Regulatory Affairs and Medical Device Quality Internship", department: "Regulatory Affairs & Quality Assurance", startDate: d("2026-09-30"), endDate: d("2026-12-31"), duration: "3 Months 2 Days", totalHours: 1250.5 },
  }],
  ["internship-minimal-specimen.pdf", {
    learnerName: "Riya Shah", programName: "MedSkills Internship Program", completionDate: d("2026-06-28"), issueDate: d("2026-10-04"), expiresOn: null,
    certificateId: "MSC-2026-INT-PREV25", verifyUrl: "https://www.medskillscatalyst.com/verify/PREVIEWxxxxxxxxxxxxxxx",
    internship: { title: "Pharmacovigilance Internship", department: null, startDate: d("2026-06-01"), endDate: d("2026-06-28"), duration: "4 Weeks", totalHours: null },
  }],
];

async function main() {
  await mkdir(dir, { recursive: true });
  await mkdir(output, { recursive: true });
  const pkg = await buildInternshipPackage();
  await writeFile(path.join(dir, "background.pdf"), pkg.background);
  await writeFile(path.join(dir, "layout.json"), JSON.stringify(pkg.layout, null, 2) + "\n");
  for (const [file, data] of SPECIMENS) {
    const out = await renderCertificate(pkg.spec, data, pkg.loader);
    await writeFile(path.join(output, file), await labelPreview(out.bytes));
  }
  console.log(`Created internship background + layout and ${SPECIMENS.length} labelled specimens.`);
}

if (typeof require !== "undefined" && require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
