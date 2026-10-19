-- Masterclass registrations (24 October 2026 masterclass and future events).
-- Purely ADDITIVE and idempotent: two new enum types and one new table with a
-- nullable FK to leads. No existing table or column is altered or dropped, so
-- this is safe to apply to production and safe to re-run.

-- ── Enums ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "public"."MasterclassAcademicStatus" AS ENUM ('FIRST_YEAR', 'SECOND_YEAR', 'THIRD_YEAR', 'GRADUATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."MasterclassEmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── masterclass_registrations ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."masterclass_registrations" (
    "id"                    TEXT NOT NULL,
    "event_key"             TEXT NOT NULL,
    "full_name"             TEXT NOT NULL,
    "email"                 TEXT NOT NULL,
    "phone"                 TEXT NOT NULL,
    "university"            TEXT NOT NULL,
    "university_source"     TEXT NOT NULL DEFAULT 'manual',
    "academic_status"       "public"."MasterclassAcademicStatus" NOT NULL,
    "consent_at"            TIMESTAMPTZ(6) NOT NULL,
    "consent_text_version"  TEXT NOT NULL,
    "utm_source"            TEXT,
    "utm_medium"            TEXT,
    "utm_campaign"          TEXT,
    "utm_content"           TEXT,
    "utm_term"              TEXT,
    "gclid"                 TEXT,
    "fbclid"                TEXT,
    "referrer"              TEXT,
    "landing_page"          TEXT,
    "lead_id"               BIGINT,
    "email_status"          "public"."MasterclassEmailStatus" NOT NULL DEFAULT 'PENDING',
    "email_attempts"        INTEGER NOT NULL DEFAULT 0,
    "email_last_error"      TEXT,
    "email_provider_id"     TEXT,
    "email_sent_at"         TIMESTAMPTZ(6),
    "email_next_attempt_at" TIMESTAMPTZ(6),
    "email_claimed_at"      TIMESTAMPTZ(6),
    "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "masterclass_registrations_pkey" PRIMARY KEY ("id")
);

-- One registration per student per event, whether they come back with the
-- same email or the same phone.
CREATE UNIQUE INDEX IF NOT EXISTS "masterclass_registrations_event_key_email_key"
  ON "public"."masterclass_registrations"("event_key", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "masterclass_registrations_event_key_phone_key"
  ON "public"."masterclass_registrations"("event_key", "phone");
CREATE INDEX IF NOT EXISTS "masterclass_registrations_event_key_created_at_idx"
  ON "public"."masterclass_registrations"("event_key", "created_at" DESC);
-- The email retry sweep looks rows up by status + due time.
CREATE INDEX IF NOT EXISTS "masterclass_registrations_email_status_email_next_attempt_a_idx"
  ON "public"."masterclass_registrations"("email_status", "email_next_attempt_at");
CREATE INDEX IF NOT EXISTS "masterclass_registrations_lead_id_idx"
  ON "public"."masterclass_registrations"("lead_id");

DO $$ BEGIN
  ALTER TABLE "public"."masterclass_registrations"
    ADD CONSTRAINT "masterclass_registrations_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Row Level Security ────────────────────────────────────────────────
-- Reached ONLY through Prisma on the server. RLS on with no permissive
-- policies: anon/authenticated (the browser-facing Supabase roles) get
-- nothing, matching leads, invoices and the CMS tables.
ALTER TABLE "public"."masterclass_registrations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."masterclass_registrations" FROM anon, authenticated;
