import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { BatchStatus } from "../src/generated/prisma/enums";

async function main() {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
  });

  // Seed Foundation Program
  const foundationCourse = await db.course.upsert({
    where: { slug: "foundation-program" },
    create: {
      name: "MedTech Foundation Program",
      slug: "foundation-program",
      description: "Fundamental accelerator for life-science graduates entering global MedTech brands.",
      base_price_paise: 499900, // ₹4,999
      gst_rate_pct: 18,
      duration_weeks: 1,
      mode: "ONLINE",
      is_active: true,
    },
    update: {
      base_price_paise: 499900, // ₹4,999
      duration_weeks: 1,
      is_active: true,
    },
  });

  let foundationBatch = await db.batch.findFirst({
    where: { course_id: foundationCourse.id, status: BatchStatus.ENROLLING },
  });
  foundationBatch ??= await db.batch.create({
    data: {
      course_id: foundationCourse.id,
      name: "Cohort 1 — September 2026",
      start_date: new Date("2026-11-14"),
      seat_capacity: 20,
      status: BatchStatus.ENROLLING,
    },
  });

  console.log(`Foundation Program Course ID: ${foundationCourse.id}`);
  console.log(`Foundation Program Cohort: ${foundationBatch.name}`);

  // Seed Advanced Module
  const advancedCourse = await db.course.upsert({
    where: { slug: "advanced-module" },
    create: {
      name: "MedTech Advanced Module",
      slug: "advanced-module",
      description: "Advanced-level module specializing in device sales, key accounts, and market access.",
      base_price_paise: 3999900, // ₹39,999
      gst_rate_pct: 18,
      duration_weeks: 6,
      mode: "ONLINE",
      is_active: true,
    },
    update: {
      is_active: true,
    },
  });

  let advancedBatch = await db.batch.findFirst({
    where: { course_id: advancedCourse.id, status: BatchStatus.ENROLLING },
  });
  advancedBatch ??= await db.batch.create({
    data: {
      course_id: advancedCourse.id,
      name: "Cohort 1 — September 2026",
      start_date: new Date("2026-11-14"),
      seat_capacity: 20,
      status: BatchStatus.ENROLLING,
    },
  });

  console.log(`Advanced Module Course ID: ${advancedCourse.id}`);
  console.log(`Advanced Module Cohort: ${advancedBatch.name}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
