-- Paid masterclass registration (₹999 after the festive free offer ends), and
-- semester-based academic status.
-- Purely ADDITIVE and idempotent: one enum type and five nullable/defaulted
-- columns on masterclass_registrations. Existing rows become NOT_REQUIRED
-- (they registered free), which is exactly what they are.

DO $$ BEGIN
  CREATE TYPE "public"."MasterclassPaymentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PAID', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "public"."masterclass_registrations"
  ADD COLUMN IF NOT EXISTS "amount_paise"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "payment_status"      "public"."MasterclassPaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS "razorpay_order_id"   TEXT,
  ADD COLUMN IF NOT EXISTS "razorpay_payment_id" TEXT,
  ADD COLUMN IF NOT EXISTS "paid_at"             TIMESTAMPTZ(6);

-- One registration per order and per payment: the webhook and the browser
-- callback both look registrations up by these, and must never match two.
CREATE UNIQUE INDEX IF NOT EXISTS "masterclass_registrations_razorpay_order_id_key"
  ON "public"."masterclass_registrations"("razorpay_order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "masterclass_registrations_razorpay_payment_id_key"
  ON "public"."masterclass_registrations"("razorpay_payment_id");

-- Academic status moves from years to semesters (1st–8th). Values are only
-- ADDED: registrations already stored as FIRST_YEAR etc. keep their value.
ALTER TYPE "public"."MasterclassAcademicStatus" ADD VALUE IF NOT EXISTS 'SEMESTER_1';
ALTER TYPE "public"."MasterclassAcademicStatus" ADD VALUE IF NOT EXISTS 'SEMESTER_2';
ALTER TYPE "public"."MasterclassAcademicStatus" ADD VALUE IF NOT EXISTS 'SEMESTER_3';
ALTER TYPE "public"."MasterclassAcademicStatus" ADD VALUE IF NOT EXISTS 'SEMESTER_4';
ALTER TYPE "public"."MasterclassAcademicStatus" ADD VALUE IF NOT EXISTS 'SEMESTER_5';
ALTER TYPE "public"."MasterclassAcademicStatus" ADD VALUE IF NOT EXISTS 'SEMESTER_6';
ALTER TYPE "public"."MasterclassAcademicStatus" ADD VALUE IF NOT EXISTS 'SEMESTER_7';
ALTER TYPE "public"."MasterclassAcademicStatus" ADD VALUE IF NOT EXISTS 'SEMESTER_8';
