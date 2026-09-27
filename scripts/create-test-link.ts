/**
 * Creates a demo Course + Batch + EnrollmentLink for the newest lead and
 * prints the /enroll URL. Until the admin "Send enrollment link" UI ships
 * (Phase 2), this is also the manual way to issue a real link:
 *   npx tsx scripts/create-test-link.ts [lead-email]
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });

import { randomBytes } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
  });

  const course = await db.course.upsert({
    where: { slug: "medtech-accelerator" },
    create: {
      name: "MedTech Career Accelerator",
      slug: "medtech-accelerator",
      description:
        "6-week accelerator for life-science graduates entering global MedTech brands.",
      base_price_paise: 4999900, // ₹49,999
      gst_rate_pct: 18,
      duration_weeks: 6,
      mode: "ONLINE",
    },
    update: {},
  });

  let batch = await db.batch.findFirst({
    where: { course_id: course.id, name: "Cohort 1 — September 2026" },
  });
  batch ??= await db.batch.create({
    data: {
      course_id: course.id,
      name: "Cohort 1 — September 2026",
      start_date: new Date("2026-11-14"),
      seat_capacity: 20,
      status: "ENROLLING",
    },
  });

  const emailArg = process.argv[2];
  const lead = emailArg
    ? await db.lead.findUnique({ where: { email: emailArg } })
    : await db.lead.findFirst({ orderBy: { created_at: "desc" } });
  if (!lead) throw new Error("No lead found" + (emailArg ? ` for ${emailArg}` : ""));

  const token = randomBytes(24).toString("base64url");
  await db.enrollmentLink.create({
    data: {
      token,
      lead_id: lead.id,
      batch_id: batch.id,
      price_paise: course.base_price_paise,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });

  console.log(`Lead: ${lead.full_name} <${lead.email}>`);
  console.log(`Link: http://localhost:3000/enroll/${token}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
