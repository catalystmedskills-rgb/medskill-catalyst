import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { BatchStatus } from "../src/generated/prisma/enums";

async function main() {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
  });

  console.log("Connecting to the database...");

  // Update all batches that are ENROLLING to start on 2026-11-14
  const result = await db.batch.updateMany({
    where: {
      status: BatchStatus.ENROLLING,
    },
    data: {
      start_date: new Date("2026-11-14"),
    },
  });

  console.log(`Successfully updated ${result.count} enrolling batches to start on November 14, 2026.`);

  // Query and print out all batches in database to confirm
  const currentBatches = await db.batch.findMany({
    include: {
      course: true,
    },
  });

  console.log("\nCurrent Cohort List in Database:");
  for (const b of currentBatches) {
    console.log(`- Course: ${b.course.name} (${b.course.slug})`);
    console.log(`  Cohort: ${b.name}`);
    console.log(`  Start Date: ${b.start_date ? b.start_date.toISOString() : "None"}`);
    console.log(`  Status: ${b.status}`);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
