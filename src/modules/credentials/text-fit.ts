import type { TextBox } from "./template-config";

/** Minimal font interface (pdf-lib PDFFont satisfies it). */
export type MeasurableFont = {
  widthOfTextAtSize(text: string, size: number): number;
};

export type FitResult =
  | { ok: true; size: number; lines: string[] }
  | { ok: false; reason: string };

function wrap(words: string[], font: MeasurableFont, size: number, width: number, maxLines: number): string[] | null {
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
      continue;
    }
    if (!current) return null; // a single word wider than the box
    lines.push(current);
    current = word;
    if (font.widthOfTextAtSize(current, size) > width) return null;
    if (lines.length >= maxLines) return null;
  }
  if (current) lines.push(current);
  return lines.length <= maxLines ? lines : null;
}

/**
 * The fit rule (PRD §10): keep the design size if it fits on one line; else
 * shrink in 0.5pt steps toward minSize, preferring one line, then allow
 * wrapping up to maxLines at the largest size that fits the box height. If
 * nothing fits, the caller must block issuance — text is never clipped or
 * allowed to overflow the approved artwork.
 */
export function fitText(text: string, font: MeasurableFont, box: Pick<TextBox, "width" | "height" | "size" | "minSize" | "maxLines" | "lineHeight">): FitResult {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { ok: false, reason: "empty" };
  const words = clean.split(" ");

  for (let lines = 1; lines <= box.maxLines; lines++) {
    for (let size = box.size; size >= box.minSize - 1e-9; size -= 0.5) {
      const needed = lines === 1 ? size : size + (lines - 1) * size * box.lineHeight;
      if (needed > box.height + 1e-6) continue;
      const wrapped = wrap(words, font, size, box.width, lines);
      if (wrapped && wrapped.length <= lines) return { ok: true, size, lines: wrapped };
    }
  }
  return { ok: false, reason: `does not fit within ${box.maxLines} line(s) at ≥ ${box.minSize}pt` };
}

// ── Letters: runs of regular/bold words, optional letter-spacing ──────

/** `glue`: no space before this run in the source ("**Intern**." → "." glues to "Intern"). */
export type Run = { text: string; bold: boolean; glue?: boolean; prefix?: boolean };
export type RunFit = { ok: true; size: number; lines: Run[][] } | { ok: false; reason: string };

/** "We offer **MedTech Sales Intern**." → runs, keeping where spaces really were. */
export function parseRuns(text: string): Run[] {
  const parts = text.split("**");
  const runs: Run[] = [];
  let prevEndsWithSpace = true;
  parts.forEach((part, i) => {
    if (!part) return;
    // An unmatched trailing ** is literal-free: its text stays regular.
    const bold = i % 2 === 1 && i < parts.length - 1;
    const startsWithSpace = /^\s/.test(part);
    part
      .split(/\s+/)
      .filter(Boolean)
      .forEach((word, j) => runs.push({ text: word, bold, glue: j === 0 && !startsWithSpace && !prevEndsWithSpace && runs.length > 0 }));
    prevEndsWithSpace = /\s$/.test(part);
  });
  return runs;
}

/** User-typed values must never inject formatting. */
export const stripMarkers = (s: string) => s.replace(/\*\*/g, "");

/** Width of text at a size with letter-spacing (em) applied between characters. */
export function trackedWidth(font: MeasurableFont, text: string, size: number, tracking: number) {
  return font.widthOfTextAtSize(text, size) + tracking * size * Math.max(0, [...text].length - 1);
}

/**
 * Fit word runs into a box, never overflowing. Labels (valign "center") follow
 * the certificate rule: prefer one line, shrinking toward minSize, then wrap.
 * Paragraphs (valign "top") wrap at the design size first and shrink only if the
 * text still doesn't fit in maxLines. Glued runs never break apart.
 */
export function fitRuns(
  runs: Run[],
  regular: MeasurableFont,
  bold: MeasurableFont,
  box: Pick<TextBox, "width" | "height" | "size" | "minSize" | "maxLines" | "lineHeight" | "tracking" | "valign">,
  prefixFont: MeasurableFont = regular,
): RunFit {
  if (!runs.length) return { ok: false, reason: "empty" };
  const tracking = box.tracking ?? 0;
  const fontOf = (r: Run) => (r.prefix ? prefixFont : r.bold ? bold : regular);
  // Unbreakable groups: a run plus any runs glued to it.
  const groups: Run[][] = [];
  for (const r of runs) {
    if (r.glue && groups.length) groups[groups.length - 1].push(r);
    else groups.push([r]);
  }
  const attempt = (size: number, lines: number): Run[][] | null => {
    const needed = lines === 1 ? size : size + (lines - 1) * size * box.lineHeight;
    if (needed > box.height + 1e-6) return null;
    const space = regular.widthOfTextAtSize(" ", size) + tracking * size;
    const gw = (g: Run[]) => g.reduce((a, r) => a + trackedWidth(fontOf(r), r.text, size, tracking), 0);
    const out: Run[][] = [[]];
    let lineWidth = 0;
    for (const g of groups) {
      const w = gw(g);
      if (w > box.width) return null;
      const line = out[out.length - 1];
      const next = line.length ? lineWidth + space + w : w;
      if (next <= box.width) {
        line.push(...g);
        lineWidth = next;
      } else {
        if (out.length >= lines) return null;
        out.push([...g]);
        lineWidth = w;
      }
    }
    return out;
  };
  const sizes: number[] = [];
  for (let size = box.size; size >= box.minSize - 1e-9; size -= 0.5) sizes.push(size);
  if (box.valign === "top") {
    for (const size of sizes) for (let lines = 1; lines <= box.maxLines; lines++) {
      const out = attempt(size, lines);
      if (out) return { ok: true, size, lines: out };
    }
  } else {
    for (let lines = 1; lines <= box.maxLines; lines++) for (const size of sizes) {
      const out = attempt(size, lines);
      if (out) return { ok: true, size, lines: out };
    }
  }
  return { ok: false, reason: `does not fit within ${box.maxLines} line(s) at ≥ ${box.minSize}pt` };
}
