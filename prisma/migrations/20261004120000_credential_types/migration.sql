-- Credential types (PRD addendum 2026-10-04): internship completion certificates
-- on the same registry. ADDITIVE ONLY and safe to re-run: a new enum, new
-- defaulted columns, an index, and replaced/added trigger functions. Every
-- existing row becomes COURSE_COMPLETION with empty details, which is what it is.

DO $$ BEGIN
  CREATE TYPE "CredentialType" AS ENUM ('COURSE_COMPLETION', 'INTERNSHIP_COMPLETION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A program issues exactly one type of credential.
ALTER TABLE "public"."courses"
  ADD COLUMN IF NOT EXISTS "credential_type" "CredentialType" NOT NULL DEFAULT 'COURSE_COMPLETION';

-- Snapshot of the type and its type-specific details (validated in
-- src/modules/credentials/credential-types.ts). Frozen once issued, like every
-- other printed field.
ALTER TABLE "public"."credentials"
  ADD COLUMN IF NOT EXISTS "credential_type" "CredentialType" NOT NULL DEFAULT 'COURSE_COMPLETION',
  ADD COLUMN IF NOT EXISTS "details" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."credential_bulk_jobs"
  ADD COLUMN IF NOT EXISTS "credential_type" "CredentialType" NOT NULL DEFAULT 'COURSE_COMPLETION';

CREATE INDEX IF NOT EXISTS "credentials_credential_type_issued_at_idx"
  ON "public"."credentials"("credential_type", "issued_at" DESC);

-- ── Lifecycle guard: the original rules, plus type and details frozen ──
CREATE OR REPLACE FUNCTION "public"."credentials_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'credentials are never deleted; revoke instead' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW."certificate_id" IS DISTINCT FROM OLD."certificate_id"
     OR NEW."verification_token" IS DISTINCT FROM OLD."verification_token"
     OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
     OR NEW."created_by_id" IS DISTINCT FROM OLD."created_by_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
     OR NEW."credential_type" IS DISTINCT FROM OLD."credential_type" THEN
    RAISE EXCEPTION 'credential identifiers are immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD."status" IN ('VALID', 'REVOKED', 'SUPERSEDED') AND (
       NEW."student_id" IS DISTINCT FROM OLD."student_id"
    OR NEW."course_id" IS DISTINCT FROM OLD."course_id"
    OR NEW."template_id" IS DISTINCT FROM OLD."template_id"
    OR NEW."learner_name" IS DISTINCT FROM OLD."learner_name"
    OR NEW."program_name" IS DISTINCT FROM OLD."program_name"
    OR NEW."completion_date" IS DISTINCT FROM OLD."completion_date"
    OR NEW."issued_at" IS DISTINCT FROM OLD."issued_at"
    OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
    OR NEW."pdf_path" IS DISTINCT FROM OLD."pdf_path"
    OR NEW."pdf_sha256" IS DISTINCT FROM OLD."pdf_sha256"
    OR NEW."supersedes_id" IS DISTINCT FROM OLD."supersedes_id"
    OR NEW."details" IS DISTINCT FROM OLD."details") THEN
    RAISE EXCEPTION 'an issued credential cannot be edited; reissue instead' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT (
         (OLD."status" = 'ISSUING' AND NEW."status" IN ('VALID', 'FAILED'))
      OR (OLD."status" = 'FAILED'  AND NEW."status" = 'ISSUING')
      OR (OLD."status" = 'VALID'   AND NEW."status" IN ('REVOKED', 'SUPERSEDED'))
    ) THEN
      RAISE EXCEPTION 'illegal credential status transition % -> %', OLD."status", NEW."status"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- ── A credential's type is its program's type ─────────────────────
CREATE OR REPLACE FUNCTION "public"."credentials_type_matches_program"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE program_type "CredentialType";
BEGIN
  SELECT "credential_type" INTO program_type FROM "public"."courses" WHERE "id" = NEW."course_id";
  IF program_type IS DISTINCT FROM NEW."credential_type" THEN
    RAISE EXCEPTION 'credential type % does not match its program''s type %', NEW."credential_type", program_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "credentials_type_matches_program" ON "public"."credentials";
CREATE TRIGGER "credentials_type_matches_program"
  BEFORE INSERT ON "public"."credentials"
  FOR EACH ROW EXECUTE FUNCTION "public"."credentials_type_matches_program"();

-- ── A program's type is fixed once it has issued anything ─────────
CREATE OR REPLACE FUNCTION "public"."courses_credential_type_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."credential_type" IS DISTINCT FROM OLD."credential_type"
     AND EXISTS (SELECT 1 FROM "public"."credentials" WHERE "course_id" = OLD."id") THEN
    RAISE EXCEPTION 'this program has issued credentials; its credential type cannot change'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "courses_credential_type_guard" ON "public"."courses";
CREATE TRIGGER "courses_credential_type_guard"
  BEFORE UPDATE OF "credential_type" ON "public"."courses"
  FOR EACH ROW EXECUTE FUNCTION "public"."courses_credential_type_guard"();
