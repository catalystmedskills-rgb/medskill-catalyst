import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/src/lib/db";
import { BatchStatus } from "@/src/generated/prisma/enums";
import { type EnrollPageData } from "@/src/app/enroll/[token]/enroll-client";
import { FoundationLandingClient } from "./landing-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MedTech Foundation Module | MedSkills Catalyst",
  description:
    "Break into the MedTech industry. Master commercial competency, clinical confidence, and MedTech recruitment frameworks. Next cohort starting 14 November 2026.",
};

export default async function FoundationLandingPage() {
  const course = await db.course.findUnique({ where: { slug: "foundation-program" } });
  if (!course || !course.is_active) notFound();

  const batch =
    (await db.batch.findFirst({
      where: { course_id: course.id, status: BatchStatus.ENROLLING },
      orderBy: { created_at: "desc" },
    })) ??
    (await db.batch.findFirst({ where: { course_id: course.id }, orderBy: { created_at: "desc" } }));
  if (!batch) notFound();

  const data: EnrollPageData = {
    token: "",
    alreadyCompleted: false,
    alreadyPaid: false,
    course: {
      name: course.name,
      description: course.description,
      durationWeeks: course.duration_weeks,
      mode: course.mode,
      gstRatePct: Number(course.gst_rate_pct),
    },
    batch: {
      name: batch.name,
      startDate: batch.start_date
        ? new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(
            batch.start_date,
          )
        : null,
      seatCapacity: batch.seat_capacity,
    },
    pricePaise: course.base_price_paise,
    discountPaise: 0,
    expiresAt: "",
    lead: { name: "", email: "", phone: null },
  };

  return <FoundationLandingClient data={data} />;
}
