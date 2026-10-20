-- Degree course on masterclass registrations (B.Pharm, M.Pharm, ...).
-- Purely ADDITIVE and idempotent: two nullable columns; older registrations keep NULL.
ALTER TABLE "public"."masterclass_registrations"
  ADD COLUMN IF NOT EXISTS "course"        TEXT,
  ADD COLUMN IF NOT EXISTS "course_source" TEXT;
