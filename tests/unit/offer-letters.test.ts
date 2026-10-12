import { describe, expect, it } from "vitest";
import { fitRuns, parseRuns } from "@/src/modules/credentials/text-fit";
import { buildOfferDetails, greetingName, offerDedupeContext, publicOfferDetails } from "@/src/modules/credentials/credential-types";
import { normalizeDuration, normalizeOfferType, normalizeStipendPeriod } from "@/src/modules/credentials/bulk";

// Every character 1 unit wide at size 1 (space included), so widths are predictable.
const mono = { widthOfTextAtSize: (t: string, size: number) => t.length * size };

describe("letter text: bold runs and wrapping", () => {
  it("keeps punctuation glued to a bold role", () => {
    const runs = parseRuns("in the role of **MedTech Sales Intern**.");
    expect(runs.map((r) => [r.text, r.bold, !!r.glue])).toEqual([
      ["in", false, false], ["the", false, false], ["role", false, false], ["of", false, false],
      ["MedTech", true, false], ["Sales", true, false], ["Intern", true, false], [".", false, true],
    ]);
  });

  it("never breaks a glued group across lines", () => {
    const fit = fitRuns(parseRuns("aaaa **bbbb**."), mono, mono, { width: 9, height: 100, size: 1, minSize: 1, maxLines: 3, lineHeight: 1.5, tracking: 0, valign: "top" });
    expect(fit.ok && fit.lines.map((l) => l.map((r) => r.text).join("|"))).toEqual(["aaaa", "bbbb|."]);
  });

  it("paragraphs wrap at the design size before shrinking; labels shrink before wrapping", () => {
    // 23 units of text: too wide at size 2 (46), fits one line at size 1 (23 ≤ 25).
    const box = { width: 25, height: 100, size: 2, minSize: 1, maxLines: 3, lineHeight: 1.5, tracking: 0 };
    const text = parseRuns("one two three four five");
    const para = fitRuns(text, mono, mono, { ...box, valign: "top" });
    const label = fitRuns(text, mono, mono, { ...box, valign: "center" });
    expect(para.ok && para.size).toBe(2);
    expect(para.ok && para.lines.length).toBeGreaterThan(1);
    expect(label.ok && label.lines.length).toBe(1);
    expect(label.ok && label.size).toBeLessThan(2);
  });

  it("an unmatched ** never makes text bold", () => {
    expect(parseRuns("a **b").every((r) => !r.bold)).toBe(true);
  });
});

describe("offer details", () => {
  const base = { offerType: "INTERNSHIP" as const, role: "MedTech Sales Intern", startDate: "2026-10-15", durationCount: 2, durationUnit: "MONTHS" as const, mode: "REMOTE" as const };

  it("greets by first name, skipping honorifics, unless overridden", () => {
    expect(greetingName("Sejal Sanjay Khapare")).toBe("Sejal");
    expect(greetingName("Dr. Aanya Venkataraman")).toBe("Aanya");
    expect(buildOfferDetails({ ...base, greetingName: "Sejal Ji" }, "Sejal Khapare").greetingName).toBe("Sejal Ji");
  });

  it("labels duration and stores the stipend in paise with an INR label", () => {
    const d = buildOfferDetails({ ...base, stipendRupees: "12,500", stipendPeriod: "PER_MONTH" }, "Riya Shah");
    expect(d.duration.label).toBe("2 Months");
    expect(d.stipend).toEqual({ amountPaise: 1_250_000, period: "PER_MONTH", label: "INR 12,500 per month" });
    expect(buildOfferDetails({ ...base, durationCount: 1, durationUnit: "WEEKS" }, "Riya").duration.label).toBe("1 Week");
  });

  it("rejects incomplete or impossible offers", () => {
    expect(() => buildOfferDetails({ ...base, stipendRupees: 5000 }, "x")).toThrow(/per month or in total/);
    expect(() => buildOfferDetails({ ...base, role: "" }, "x")).toThrow(/role/);
    expect(() => buildOfferDetails({ ...base, durationCount: 0 }, "x")).toThrow();
    expect(() => buildOfferDetails({ ...base, startDate: "2026-02-30" }, "x")).toThrow(/real date/);
  });

  it("publishes only offer type, role and start date", () => {
    const d = buildOfferDetails({ ...base, institution: "Private College", stipendRupees: 9999, stipendPeriod: "TOTAL", mode: "HYBRID" }, "Riya Shah");
    expect(publicOfferDetails(d)).toEqual({ offerType: "Internship", role: "MedTech Sales Intern", startDate: "2026-10-15" });
    expect(JSON.stringify(publicOfferDetails(d))).not.toMatch(/Private|9,999|HYBRID|Riya/);
  });

  it("treats the same type, role and start date as one offer", () => {
    const a = offerDedupeContext(buildOfferDetails(base, "x"));
    expect(offerDedupeContext(buildOfferDetails({ ...base, role: "medtech  SALES intern" }, "x"))).toBe(a);
    expect(offerDedupeContext(buildOfferDetails({ ...base, startDate: "2026-11-01" }, "x"))).not.toBe(a);
  });
});

describe("bulk value parsing", () => {
  it("reads spreadsheet wording and refuses guesses", () => {
    expect(normalizeOfferType("Campus Ambassador")).toBe("CAMPUS_AMBASSADOR");
    expect(normalizeOfferType("CA")).toBe("CAMPUS_AMBASSADOR");
    expect(normalizeOfferType("intern")).toBe("INTERNSHIP");
    expect(normalizeOfferType("volunteer")).toBeNull();
    expect(normalizeDuration("2 months")).toEqual({ count: 2, unit: "MONTHS" });
    expect(normalizeDuration("8wk")).toEqual({ count: 8, unit: "WEEKS" });
    expect(normalizeDuration("2")).toBeNull();
    expect(normalizeStipendPeriod("Monthly")).toBe("PER_MONTH");
    expect(normalizeStipendPeriod("one time")).toBe("TOTAL");
    expect(normalizeStipendPeriod("weekly")).toBe("INVALID");
  });
});
