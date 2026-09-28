import { describe, expect, it } from "vitest";
import { safeSpreadsheetCell } from "../../src/lib/spreadsheet-export";
describe("spreadsheet export", () => {
  it.each(["=HYPERLINK(\"https://example.com\")", "+911234567890", " @SUM(A1)", "\t=1", "-2+3", "\rpayload"])("neutralizes formula-like input %s", (value) => {
    expect(safeSpreadsheetCell(value)).toBe(`'${value}`);
  });
  it("preserves ordinary names, numeric identifiers and blanks", () => {
    expect(safeSpreadsheetCell("Aanya Raman")).toBe("Aanya Raman");
    expect(safeSpreadsheetCell(123)).toBe("123");
    expect(safeSpreadsheetCell(null)).toBe("");
  });
});
