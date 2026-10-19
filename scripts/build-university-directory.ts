/**
 * Builds public/data/indian-universities.json — the directory behind the
 * university autocomplete on /cohort/october-24.
 *
 * Source: AISHE university list as published (MIT licence) at
 *   https://github.com/arpitagarwala/indian-institutions-data
 * Pinned to a reviewed commit so the list only changes when someone re-runs
 * this script on purpose:
 *
 *   curl -sSLo /tmp/universities.json \
 *     https://raw.githubusercontent.com/arpitagarwala/indian-institutions-data/<sha>/data/json/universities.json
 *   npx tsx scripts/build-university-directory.ts /tmp/universities.json <sha>
 *
 * The output keeps only what the combobox needs (display name + state) so the
 * file stays small enough to fetch on first focus of the field.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SOURCE_REPO = "https://github.com/arpitagarwala/indian-institutions-data";
const OUT = resolve(__dirname, "../public/data/indian-universities.json");

// Words kept lower-case mid-name ("University of Delhi").
const SMALL = new Set(["of", "and", "for", "the", "in", "at", "on", "to", "de", "da"]);
// Acronyms that contain vowels, so the no-vowel rule below would miss them.
const ACRONYMS = new Set([
  "AIIMS", "IIT", "IIIT", "NIT", "IISER", "IISC", "IIM", "ICAR", "ICFAI", "AMITY",
  "SRM", "KIIT", "NIMS", "NMIMS", "SVKM", "JSS", "KLE", "PES", "MIT", "VIT",
  "SGT", "GLA", "LNM", "IGNOU", "UPES", "DIT", "ITM", "NIIT", "DY", "BITS",
  "IIEST", "IIIT-DM", "IIITDM", "SCSVMV", "SASTRA", "DAV", "BHU", "AMU", "JNU",
]);
// Words that read wrongly in plain title case.
const FIXED: Record<string, string> = { AMITY: "Amity", MIT: "MIT", DR: "Dr", ST: "St", SMT: "Smt" };

function hasVowel(w: string): boolean {
  return /[AEIOU]/.test(w);
}

function caseWord(word: string, index: number): string {
  if (!word) return word;
  // Keep punctuation wrappers, case the core.
  const m = word.match(/^([("'\[]*)(.*?)([)"'\],.:;]*)$/);
  const [, pre, core, post] = m ?? ["", "", word, ""];
  if (!core) return word;
  const upper = core.toUpperCase();
  if (FIXED[upper]) return pre + FIXED[upper] + post;
  if (ACRONYMS.has(upper)) return pre + upper + post;
  // Dotted initials (S.R.M.) and short vowel-less tokens (KLE, SGT) are acronyms.
  if (/^([A-Z]\.)+[A-Z]?$/i.test(core)) return pre + upper + post;
  if (core.length <= 5 && /^[A-Z]+$/i.test(core) && !hasVowel(upper)) return pre + upper + post;
  // A word after an opening parenthesis still starts with a capital.
  if (pre.includes("(")) index = 0;
  // Parenthesised short tokens are almost always acronyms: (BHU), (Deemed).
  if (pre.includes("(") && core.length <= 5 && /^[A-Z]+$/i.test(core) && upper !== "DEEMED") {
    return pre + upper + post;
  }
  const lower = core.toLowerCase();
  if (index > 0 && SMALL.has(lower)) return pre + lower + post;
  // Hyphenated words: case each part.
  const cased = lower
    .split("-")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join("-");
  return pre + cased + post;
}

export function displayName(raw: string): string {
  const clean = raw
    .replace(/\s+,/g, ",")
    .replace(/,(?=\S)/g, ", ") // "University,Chandigarh" → "University, Chandigarh"
    .replace(/(\S)\(/g, "$1 (") // "Murthal(Sonepat)" → "Murthal (Sonepat)"
    .replace(/\s+/g, " ")
    .replace(/[\s,.]+$/, "")
    .trim();
  return clean
    .split(" ")
    .map((w, i) => caseWord(w, i))
    .join(" ");
}

type SourceRow = { aisheCode?: string; name?: string; stateName?: string };

function main() {
  const [src, sha] = process.argv.slice(2);
  if (!src || !sha) {
    console.error("usage: tsx scripts/build-university-directory.ts <universities.json> <commit-sha>");
    process.exit(1);
  }
  const rows = JSON.parse(readFileSync(src, "utf8")) as SourceRow[];
  const seen = new Set<string>();
  const universities: { n: string; s: string }[] = [];
  for (const r of rows) {
    if (!r.name || typeof r.name !== "string") continue;
    const n = displayName(r.name);
    const s = typeof r.stateName === "string" ? displayName(r.stateName) : "";
    const key = (n + "|" + s).toLowerCase();
    if (seen.has(key) || n.length < 3 || n.length > 200) continue;
    seen.add(key);
    universities.push({ n, s });
  }
  universities.sort((a, b) => a.n.localeCompare(b.n, "en-IN"));

  const out = {
    source: `${SOURCE_REPO} (AISHE university list)`,
    commit: sha,
    license: "MIT — Copyright (c) 2026 Arpit Agarwala",
    generated: new Date().toISOString().slice(0, 10),
    count: universities.length,
    universities,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out) + "\n");
  console.log(`wrote ${universities.length} universities to ${OUT}`);
}

if (require.main === module) main();
