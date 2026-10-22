-- City and reasons-for-joining on masterclass registrations.
-- Purely ADDITIVE and idempotent; older registrations keep NULL / empty.
ALTER TABLE "public"."masterclass_registrations"
  ADD COLUMN IF NOT EXISTS "city"         TEXT,
  ADD COLUMN IF NOT EXISTS "join_reasons" TEXT[] NOT NULL DEFAULT '{}';
