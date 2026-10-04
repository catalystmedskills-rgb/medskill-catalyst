import { describe, expect, it } from "vitest";
import { parseISODate } from "../../src/modules/credentials/dates";
import { calendarDuration } from "../../src/modules/credentials/duration";
import {
  buildInternshipDetails,
  CREDENTIAL_TYPES,
  internshipDedupeContext,
  publicInternshipDetails,
} from "../../src/modules/credentials/credential-types";
import { CredentialType as PrismaCredentialType } from "../../src/generated/prisma/enums";

const d = (s: string) => parseISODate(s)!;
const label = (a: string, b: string) => calendarDuration(d(a), d(b)).label;

describe("calendar duration (start and end dates are the source of truth)", () => {
  it("prints whole months", () => {
    expect(label("2026-06-01", "2026-08-31")).toBe("3 Months");
    expect(label("2026-06-01", "2026-06-30")).toBe("1 Month");
    expect(label("2026-01-15", "2027-01-14")).toBe("12 Months");
  });
  it("prints whole weeks under a month", () => {
    expect(label("2026-06-01", "2026-06-28")).toBe("4 Weeks");
    expect(label("2026-06-01", "2026-06-07")).toBe("1 Week");
  });
  it("prints exact months and days otherwise, never rounding", () => {
    expect(label("2026-06-01", "2026-08-15")).toBe("2 Months 15 Days");
    expect(label("2026-06-01", "2026-07-01")).toBe("1 Month 1 Day");
    expect(label("2026-06-01", "2026-06-10")).toBe("10 Days");
    expect(label("2026-06-01", "2026-06-01")).toBe("1 Day");
  });
  it("counts both ends and handles month ends and leap years", () => {
    expect(calendarDuration(d("2026-06-01"), d("2026-08-31")).days).toBe(92);
    expect(label("2026-01-31", "2026-02-27")).toBe("1 Month");
    expect(label("2028-02-01", "2028-02-29")).toBe("1 Month");
    expect(label("2026-02-01", "2026-02-28")).toBe("1 Month");
  });
  it("refuses an end date before the start", () => {
    expect(() => calendarDuration(d("2026-06-02"), d("2026-06-01"))).toThrow();
  });
});

describe("internship details", () => {
  const base = { internshipTitle: "  Regulatory  Affairs Intern ", startDate: "2026-06-01", endDate: "2026-08-31" };

  it("computes and snapshots the duration; nobody types it", () => {
    const details = buildInternshipDetails({ ...base, duration: "99 Years" } as never);
    expect(details.internshipTitle).toBe("Regulatory Affairs Intern");
    expect(details.duration.label).toBe("3 Months");
    expect(details.totalHours).toBeNull();
    expect(details.department).toBeNull();
  });

  it("keeps hours separate and never infers them from dates", () => {
    expect(buildInternshipDetails({ ...base, totalHours: "240" }).totalHours).toBe(240);
    expect(buildInternshipDetails({ ...base, totalHours: 37.5 }).totalHours).toBe(37.5);
    expect(() => buildInternshipDetails({ ...base, totalHours: "-4" })).toThrow(/hours/);
    expect(() => buildInternshipDetails({ ...base, totalHours: "12.25" })).toThrow(/hours/);
  });

  it("rejects impossible or reversed dates", () => {
    expect(() => buildInternshipDetails({ ...base, endDate: "2026-05-31" })).toThrow(/before the start/);
    expect(() => buildInternshipDetails({ ...base, startDate: "2026-02-30" })).toThrow(/real date/);
    expect(() => buildInternshipDetails({ ...base, mode: "OFFSHORE" as never })).toThrow();
  });

  it("treats the same title and dates as the same internship regardless of case or spacing", () => {
    const a = internshipDedupeContext(buildInternshipDetails(base));
    const b = internshipDedupeContext(buildInternshipDetails({ ...base, internshipTitle: "regulatory affairs INTERN" }));
    const c = internshipDedupeContext(buildInternshipDetails({ ...base, endDate: "2026-09-30" }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("publishes only the allowlisted details", () => {
    const details = buildInternshipDetails({ ...base, department: "Regulatory", totalHours: 300, supervisor: "Dr. Private", mode: "HYBRID", location: "Pune" });
    const pub = publicInternshipDetails(details)!;
    expect(pub).toEqual({ internshipTitle: "Regulatory Affairs Intern", department: "Regulatory", startDate: "2026-06-01", endDate: "2026-08-31", duration: "3 Months" });
    expect(JSON.stringify(pub)).not.toMatch(/Private|Pune|HYBRID|300/);
    expect(publicInternshipDetails({ junk: true })).toBeNull();
  });

  it("matches the database enum exactly", () => {
    expect([...CREDENTIAL_TYPES].sort()).toEqual(Object.values(PrismaCredentialType).sort());
  });
});
