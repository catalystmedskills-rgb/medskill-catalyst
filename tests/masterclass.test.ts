import { test } from "vitest";
import assert from "node:assert/strict";
import {
  normalizeIndianMobile,
  registrationFieldsSchema,
  registrationRequestSchema,
  maskEmail,
  firstNameOf,
  ACADEMIC_STATUS_OPTIONS,
  ACADEMIC_STATUS_LABELS,
} from "../src/modules/masterclass/schema";
import {
  readMasterclassConfig,
  masterclassReadiness,
  parseZoomUrl,
  parseWhatsappUrl,
  parseStartTime,
  timeLabel,
  zoomMeetingIdFrom,
  parseFreeUntil,
  pricingAt,
  formatDeadline,
} from "../src/modules/masterclass/config";
import { nextAttemptAt, isPermanentEmailFailure, MAX_EMAIL_ATTEMPTS } from "../src/modules/masterclass/delivery";
import { leadSourceFor } from "../src/modules/masterclass/attribution";
import { masterclassConfirmationEmail, MASTERCLASS_EMAIL_SUBJECT } from "../src/modules/masterclass/email-template";

const valid = {
  fullName: "  Priya   Sharma ",
  email: "  Priya.Sharma@Gmail.COM ",
  phone: "98765 43210",
  university: " University of  Delhi ",
  universitySource: "directory",
  academicStatus: "SEMESTER_5",
  consent: true,
};

// ── Validation ───────────────────────────────────────────────────────

test("normalizes Indian mobile numbers to E.164", () => {
  assert.equal(normalizeIndianMobile("9876543210"), "+919876543210");
  assert.equal(normalizeIndianMobile("+91 98765-43210"), "+919876543210");
  assert.equal(normalizeIndianMobile("09876543210"), "+919876543210");
  assert.equal(normalizeIndianMobile("919876543210"), "+919876543210");
  assert.equal(normalizeIndianMobile("5876543210"), null); // must start 6-9
  assert.equal(normalizeIndianMobile("98765"), null);
  assert.equal(normalizeIndianMobile("+44 7700 900123"), null);
});

test("accepts a valid registration and normalizes every field", () => {
  const r = registrationFieldsSchema.parse(valid);
  assert.equal(r.fullName, "Priya Sharma");
  assert.equal(r.email, "priya.sharma@gmail.com");
  assert.equal(r.phone, "+919876543210");
  assert.equal(r.university, "University of Delhi");
  assert.equal(r.academicStatus, "SEMESTER_5");
});

test("rejects each invalid field with a field-level error", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["fullName", { fullName: " " }],
    ["fullName", { fullName: "<script>" }],
    ["email", { email: "not-an-email" }],
    ["phone", { phone: "12345" }],
    ["university", { university: "" }],
    ["academicStatus", { academicStatus: "2026" }],
    ["consent", { consent: false }],
  ];
  for (const [field, patch] of cases) {
    const r = registrationFieldsSchema.safeParse({ ...valid, ...patch });
    assert.equal(r.success, false, `${field} should fail`);
    assert.ok(r.error!.issues.some((i) => i.path[0] === field), `${field} error expected`);
  }
});

test("academic status is a stage, not a graduation year", () => {
  for (const s of ["SEMESTER_1", "SEMESTER_4", "SEMESTER_8", "GRADUATE"]) {
    assert.equal(registrationFieldsSchema.safeParse({ ...valid, academicStatus: s }).success, true);
  }
  assert.equal(registrationFieldsSchema.safeParse({ ...valid, academicStatus: "2027" }).success, false);
});

test("allows names from any script and with common punctuation", () => {
  for (const n of ["Ananya D'Souza", "Mohd. Arif", "Ravi-Kumar Iyer", "प्रिया शर्मा"]) {
    assert.equal(registrationFieldsSchema.safeParse({ ...valid, fullName: n }).success, true, n);
  }
});

test("request schema bounds attribution and rejects odd event ids", () => {
  const ok = registrationRequestSchema.safeParse({
    ...valid,
    attribution: { utm_source: "meta", utm_medium: "paid_social" },
    fbEventId: "abc_123.x",
  });
  assert.equal(ok.success, true);
  const long = registrationRequestSchema.safeParse({ ...valid, attribution: { utm_source: "x".repeat(400) } });
  assert.equal(long.success, false);
  const badId = registrationRequestSchema.safeParse({ ...valid, fbEventId: "<img>" });
  assert.equal(badId.success, false);
});

test("masks emails and extracts first names", () => {
  assert.equal(maskEmail("areeb.khan@gmail.com"), "ar••••••••@gmail.com");
  assert.equal(maskEmail("a@x.in"), "a•••@x.in");
  assert.equal(firstNameOf("  Priya  Sharma"), "Priya");
});

// ── Configuration gating ─────────────────────────────────────────────

const fullEnv = {
  MASTERCLASS_REGISTRATION_OPEN: "true",
  MASTERCLASS_ZOOM_JOIN_URL: "https://us06web.zoom.us/j/81234567890?pwd=abc",
  MASTERCLASS_START_TIME_IST: "18:00",
  MASTERCLASS_DURATION_MINUTES: "90",
  MASTERCLASS_WHATSAPP_COMMUNITY_URL: "https://chat.whatsapp.com/AbCdEfGhIjKlMn",
  RESEND_API_KEY: "re_live_key",
};

test("registration opens only when flag, Zoom link, time and Resend are all valid", () => {
  assert.deepEqual(masterclassReadiness(readMasterclassConfig(fullEnv)), { open: true, missing: [] });
  for (const k of ["MASTERCLASS_REGISTRATION_OPEN", "MASTERCLASS_ZOOM_JOIN_URL", "MASTERCLASS_START_TIME_IST", "RESEND_API_KEY"]) {
    const r = masterclassReadiness(readMasterclassConfig({ ...fullEnv, [k]: "" }));
    assert.equal(r.open, false, `${k} missing should close registration`);
    assert.equal(r.missing.length, 1);
  }
  // WhatsApp is optional: the thank-you page simply does not redirect.
  assert.equal(masterclassReadiness(readMasterclassConfig({ ...fullEnv, MASTERCLASS_WHATSAPP_COMMUNITY_URL: "" })).open, true);
});

test("placeholder and non-Zoom links are never accepted", () => {
  assert.equal(parseZoomUrl("https://zoom.us/j/[PLACEHOLDER]"), null);
  assert.equal(parseZoomUrl("http://zoom.us/j/123"), null);
  assert.equal(parseZoomUrl("https://evil.example/j/123"), null);
  assert.equal(parseZoomUrl("https://notzoom.us/j/123"), null);
  assert.ok(parseZoomUrl("https://medskills.zoom.us/j/123?pwd=x"));
  assert.equal(parseWhatsappUrl("https://chat.whatsapp.com/[PLACEHOLDER_GROUP_INVITE]"), null);
  assert.equal(parseWhatsappUrl("https://wa.me/919759249395"), null);
  assert.ok(parseWhatsappUrl("https://chat.whatsapp.com/CDVzRz1dHYiBxNPx1HH6ZD"));
});

test("start time and labels", () => {
  assert.equal(parseStartTime("6pm"), null);
  assert.equal(parseStartTime("24:00"), null);
  assert.equal(timeLabel({ startTime: "18:00", durationMinutes: 90 }), "6:00 PM – 7:30 PM IST");
  assert.equal(timeLabel({ startTime: "11:30", durationMinutes: null }), "11:30 AM IST");
  assert.equal(timeLabel({ startTime: "00:15", durationMinutes: 60 }), "12:15 AM – 1:15 AM IST");
  assert.equal(timeLabel({ startTime: null, durationMinutes: 60 }), null);
});

// ── Email retry policy ───────────────────────────────────────────────

test("backs off between attempts and stops after the limit", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  assert.equal(nextAttemptAt(1, false, now)!.getTime() - now.getTime(), 60_000);
  assert.equal(nextAttemptAt(2, false, now)!.getTime() - now.getTime(), 5 * 60_000);
  assert.ok(nextAttemptAt(MAX_EMAIL_ATTEMPTS - 1, false, now));
  assert.equal(nextAttemptAt(MAX_EMAIL_ATTEMPTS, false, now), null);
  assert.equal(nextAttemptAt(1, true, now), null);
});

test("only Resend validation errors are permanent", () => {
  assert.equal(isPermanentEmailFailure("resend_422: invalid to"), true);
  assert.equal(isPermanentEmailFailure("resend_400: bad"), true);
  assert.equal(isPermanentEmailFailure("resend_429: slow down"), false);
  assert.equal(isPermanentEmailFailure("resend_500: oops"), false);
  assert.equal(isPermanentEmailFailure("resend_exception: timeout"), false);
  assert.equal(isPermanentEmailFailure("RESEND_API_KEY missing in this deployment's env"), false);
});

// ── Attribution ──────────────────────────────────────────────────────

test("classifies lead source conservatively", () => {
  assert.equal(leadSourceFor({ utm_source: "meta", utm_medium: "paid_social" }), "META_ADS");
  assert.equal(leadSourceFor({ utm_source: "instagram", utm_medium: "cpc" }), "META_ADS");
  assert.equal(leadSourceFor({ fbclid: "IwAR123" }), "ORGANIC"); // organic FB clicks carry fbclid too
  assert.equal(leadSourceFor({ gclid: "Cj0" }), "GOOGLE_ADS");
  assert.equal(leadSourceFor({ utm_source: "whatsapp" }), "WHATSAPP");
  assert.equal(leadSourceFor({}), "ORGANIC");
});

// ── Email content ────────────────────────────────────────────────────

test("confirmation email carries the name, date, time and Zoom link, escaped", () => {
  const m = masterclassConfirmationEmail({
    firstName: "Priya<b>",
    zoomUrl: "https://us06web.zoom.us/j/81234567890?pwd=a&b",
    timeLabel: "6:00 PM – 7:30 PM IST",
    whatsappUrl: null,
  });
  assert.equal(m.subject, MASTERCLASS_EMAIL_SUBJECT);
  assert.equal(m.subject, "You're Registered! MedSkills Catalyst Masterclass — 24 October");
  assert.ok(m.html.includes("Priya&lt;b&gt;"));
  assert.ok(!m.html.includes("Priya<b>"));
  assert.ok(m.html.includes("Saturday, 24 October 2026"));
  assert.ok(m.html.includes("6:00 PM – 7:30 PM IST"));
  assert.ok(m.html.includes('href="https://us06web.zoom.us/j/81234567890?pwd=a&amp;b"'));
  assert.ok(!m.html.includes("WhatsApp community"));
  assert.ok(m.text.includes("https://us06web.zoom.us/j/81234567890?pwd=a&b"));
  assert.ok(m.text.startsWith("Hi Priya<b>,"));
});

test("derives the Zoom meeting id and prints id + passcode in the email", () => {
  assert.equal(zoomMeetingIdFrom("https://us06web.zoom.us/j/81234567890?pwd=abc"), "812 3456 7890");
  assert.equal(zoomMeetingIdFrom(null), null);
  const cfg = readMasterclassConfig({ ...fullEnv, MASTERCLASS_ZOOM_PASSCODE: "123456" });
  assert.equal(cfg.zoomPasscode, "123456");
  const m = masterclassConfirmationEmail({
    firstName: "Priya",
    zoomUrl: "https://us06web.zoom.us/j/81234567890?pwd=abc",
    timeLabel: "6:00 PM IST",
    meetingId: "812 3456 7890",
    passcode: "123456",
  });
  assert.ok(m.html.includes("812 3456 7890") && m.html.includes("123456"));
  assert.ok(m.html.includes("Medtech 101: Your First Step into the Medtech Industry"));
  assert.ok(m.text.includes("Meeting ID: 812 3456 7890 · Passcode: 123456"));
});

// ── Festive offer pricing ───────────────────────────────────────────

const FREE_UNTIL = "2026-10-22T23:59:00+05:30";

test("free-offer deadline needs an explicit timezone", () => {
  assert.equal(parseFreeUntil("2026-10-22T23:59:00"), null);
  assert.equal(parseFreeUntil("not a date+05:30"), null);
  assert.equal(parseFreeUntil(FREE_UNTIL)!.toISOString(), "2026-10-22T18:29:00.000Z");
});

test("one real deadline for everyone: free, then ₹999, then closed at session start", () => {
  const cfg = readMasterclassConfig({ ...fullEnv, MASTERCLASS_FREE_UNTIL: FREE_UNTIL, RAZORPAY_KEY_ID: "rzp_x", RAZORPAY_KEY_SECRET: "s" });
  assert.equal(pricingAt(cfg, new Date("2026-10-22T18:28:59Z")).phase, "free");
  assert.equal(pricingAt(cfg, new Date("2026-10-22T18:28:59Z")).amountPaise, 0);
  const paid = pricingAt(cfg, new Date("2026-10-22T18:29:00Z"));
  assert.equal(paid.phase, "paid");
  assert.equal(paid.amountPaise, 99_900);
  // Session starts 24 Oct 18:00 IST = 12:30Z.
  assert.equal(pricingAt(cfg, new Date("2026-10-24T12:29:59Z")).phase, "paid");
  assert.equal(pricingAt(cfg, new Date("2026-10-24T12:30:00Z")).phase, "closed");
});

test("without a deadline registration stays free; paid phase requires Razorpay keys", () => {
  const noDeadline = readMasterclassConfig(fullEnv);
  assert.equal(pricingAt(noDeadline, new Date("2026-10-23T00:00:00Z")).phase, "free");
  const noKeys = readMasterclassConfig({ ...fullEnv, MASTERCLASS_FREE_UNTIL: FREE_UNTIL });
  const r = masterclassReadiness(noKeys);
  assert.equal(r.open, false);
  assert.ok(r.missing.some((m) => m.includes("Razorpay")));
});

test("deadline label is in IST", () => {
  assert.equal(formatDeadline(new Date(FREE_UNTIL)), "Thu, 22 Oct, 11:59 PM IST");
});

test("paid confirmation email shows the amount and payment id", () => {
  const m = masterclassConfirmationEmail({
    firstName: "Priya",
    zoomUrl: "https://us06web.zoom.us/j/81234567890?pwd=abc",
    timeLabel: "6:00 PM IST",
    payment: { amountPaise: 99_900, paymentId: "pay_TEST123" },
  });
  assert.ok(m.html.includes("₹999") && m.html.includes("pay_TEST123"));
  assert.ok(m.text.includes("Amount paid: ₹999 · Payment ID pay_TEST123"));
  const free = masterclassConfirmationEmail({ firstName: "P", zoomUrl: "https://zoom.us/j/1", timeLabel: "6:00 PM IST" });
  assert.ok(!free.html.includes("Amount paid"));
});

test("academic status is offered as 1st–8th semester plus graduate; old year values are not accepted from the form", () => {
  const labels = ACADEMIC_STATUS_OPTIONS.map((o) => o.label);
  assert.deepEqual(labels, [
    "1st Semester", "2nd Semester", "3rd Semester", "4th Semester",
    "5th Semester", "6th Semester", "7th Semester", "8th Semester", "Pass-out / Graduate",
  ]);
  for (const s of ["FIRST_YEAR", "SEMESTER_9", "SEMESTER_0"]) {
    assert.equal(registrationFieldsSchema.safeParse({ ...valid, academicStatus: s }).success, false, s);
  }
  // Registrations stored before the change still render a label in admin and email.
  assert.equal(ACADEMIC_STATUS_LABELS.THIRD_YEAR, "Third Year");
});
