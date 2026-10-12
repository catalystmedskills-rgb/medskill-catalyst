-- Offer letters (owner requirement 2026-10-12): a third credential type on the same
-- registry. ADDITIVE ONLY and safe to re-run: one new enum value. Details for offer
-- letters live in credentials.details like every other type (validated by the
-- registry in src/modules/credentials/credential-types.ts).
ALTER TYPE "CredentialType" ADD VALUE IF NOT EXISTS 'OFFER_LETTER';
