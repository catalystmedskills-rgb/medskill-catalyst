# Credential system: implementation log

Branch `feat/credentials`. PRD: *Medskills Catalyst Credential Issuance & Verification
System v1.0*. Decisions: 2026-09-25.

## Architecture (inside the existing Next.js app)

```
Admin UI (/admin/credentials/*) ─┐                 ┌─ Public: /verify, /verify/{token}, /verify/{token}/certificate
JSON API (/api/credentials/*)  ──┼─ requirePermission (src/lib/auth.ts + permissions.ts)
Bulk runner (chunked actions) ───┘                 │
             src/modules/credentials/
               service.ts   issue · renderAndFinalize · resend · revoke · reissue · retry
               bulk.ts      parse (CSV/xlsx) · validate · confirm · chunked idempotent processing · export
               render.ts    pdf-lib: template background + fitted fields + vector QR + signatures
               verify.ts    token / exact-ID lookup, miss-based rate limit
               public.ts    the ONLY public payload (allowlist)
               storage.ts   private Supabase bucket, content-addressed, never overwrites
Postgres (Prisma): credentials · credential_events (append-only) · credential_email_deliveries
                   · certificate_templates (frozen once active) · credential_bulk_jobs/rows
```

Issuance state machine: **ISSUING → (PDF stored) → VALID → email**, or **ISSUING → FAILED**
(hidden publicly, retryable). A credential becomes publicly verifiable only once its PDF
exists; this deliberately reorders PRD §4.1 steps 6–7. Email failure never affects
validity. EXPIRED is derived at read time. Revoked and superseded are terminal states,
enforced by the database.

## Phase log

**1. Auth/RBAC.** Added the `ADMIN_AUTH_MODE` flag (passcode default / clerk / local-only
dev), Clerk middleware, verified-email staff binding, bootstrap admins, the central
permission matrix, the ISSUER role, individual-identity checks for writes, a Staff page
with the last-admin guard, and a break-glass script. See AUTH_ROLLOUT.md. *Production is
unchanged until the gate.*

**2–3. Schema and core.** One additive migration (idempotent; applied twice in tests).
Triggers block deletes, identifier/content edits after issue, illegal status changes,
event edits, and edits to active templates. RLS is on for every new table. IDs follow
`MSC-{YEAR}-{CODE}-{6 of 23456789ABCDEFGHJKMNPQRSTVWXYZ}` and tokens are 128-bit base64url.

**4–5. Rendering and single issuance.** Templates are data: background (PDF/PNG/JPEG),
field boxes with a fit rule (shrink, then wrap up to N lines, else block issuance), a QR
box of at least 2 cm, and signatures per template. Output is deterministic (same
credential, same bytes, SHA-256 recorded). A watermarked **development template** stands
in until the artwork arrives and is refused on production. Issuing has a review step, then
confirm.

**6. Public verification.** Pages for `/verify` and `/verify/{token}`, JSON endpoints
`/api/verify/*`, and a PDF endpoint served only while the credential is valid. Pages are
noindex, no-store, no-referrer and can't be framed. Pixels and analytics are disabled on
these routes.

**7. Email.** Reuses the existing Resend sender. Modes are off / redirect / live, and
`live` works only on production. Every attempt is recorded. Resend is limited to 5 per
hour per credential.

**8. Revoke/reissue.** Revoking requires typing the certificate ID and an internal reason
(visible to admins only). Reissue creates a new ID and token, and the old credential is
superseded atomically at the moment the new one becomes valid.

**9. Bulk.** CSV/XLSX up to 1,000 rows. Every row is validated first, including whether
the name fits on the certificate, duplicates within the file and existing credentials.
Nothing is issued before confirmation. Processing runs in chunks with per-row idempotency
keys, failed rows can be retried, and results export as CSV with formula-injection
protection.

**11–13. Tests, acceptance, security.** 87 Vitest tests against real Postgres 16
(migrations applied from the repo). Production build passes. A browser E2E ran on a
production build (screenshots in the session). See ACCEPTANCE_AND_SECURITY.md.

## Issues found and fixed during the build

- React 19 resets a form after a form action, which wiped the reviewed issue form. Found
  in E2E and fixed (review now runs as a transition).
- A same-key concurrent submit could report "duplicate" for the user's own request. Found
  by a flaky test and fixed (re-check the idempotency key before reporting).
- Layout-only gates don't protect pages that render in parallel, so every page now checks
  its own permission.
- Meta Pixel and GA would have received token-bearing verification URLs. Now excluded on `/verify*`.

## Assumptions made (not business rules)

- Learner = the existing `students` row, matched by email case-insensitively. The printed
  name is snapshotted on the credential, and profile edits never change issued certificates.
- Duplicate rule without a cohort: learner + program + completion date.
- The old page for a superseded credential says "replaced by a newer credential" but does
  **not** link to the new one (a privacy default; easy to change).
- `issue_date` / `expires_at` columns in bulk files are ignored (to prevent back-dating).
  `external_learner_ref` is accepted but not yet stored.
- Dates in bulk files: ISO or Indian DD/MM/YYYY. US order is refused rather than guessed.
- Validity anchor per program: completion date by default, or issue date.

## Remaining work / TBD

### Release hardening and signed template, 2026-09-27

Gagan Victor's supplied signature is integrated in asset4; the owner confirmed Gagan's authorization. Fixed the two upload tests to include the signature and updated the package README. All 106 tests, type-check and production build pass. Full npm audit reports zero vulnerabilities after framework/dependency updates and SheetJS removal. Both signed specimens were visually inspected and their QR codes decoded at 150 dpi. Local production-server smoke checks passed: verification page 200, invalid token 404 with noindex/no-store, unauthenticated issuance/export 401.

Added private-storage race/error checks, custom-font glyph validation, Clerk-mode legacy API authorization, formula-safe exports, CI and a read-only preflight script. Bundled licensed website fonts after a clean build exposed a Google Fonts loader failure; type-check and build pass with local fonts. See `RELEASE_READINESS_2026-09-27.md` for exact changes, current evidence and remaining live blockers. That document supersedes older pending-artwork/security notes below. Browser inspection identified the actual live Vercel project under `info-74073127`, differing from the stale sibling project link. Credential/Clerk settings and a Preview database are missing; the locally configured Supabase project is inactive, with live database identity still unverified. Live verification returns 404. No remote changes or real issuance were performed.

### Continuation, 2026-09-27

The owner selected adaptation of the existing Foundation design. The upload package is now in `assets/credentials/foundation-v1/` (background PDF, layout JSON, three font files and instructions), with labelled short/long-name previews in `output/pdf/`. Rebuild with `npx tsx scripts/build-foundation-template.ts`. It keeps the renderer generic and uses its real QR; the source design's decorative QR and cursive simulated signature are not carried over. Authentic signature artwork and final signatory/program-code decisions are still pending. Nothing has been uploaded, activated or deployed.

Fixed upload-slot resolution for custom font references: resolve the flat font path/digest from uploaded metadata rather than nesting an asset object inside `path`. Image shorthand remains compatible. Regression tests cover real Foundation package parsing, missing slots and invalid font MIME types.

Validation on 2026-09-27: type-check and production build passed; 91 tests passed (7 files). Both specimen PDFs were visually reviewed, and their QR codes decoded to the exact preview URL after rasterization at 150 dpi. Build still reports the pre-existing missing `metadataBase` warning. No live upload/activation or production smoke test was performed.

1. Review the adapted Foundation package and supply any required authentic signature, then upload/approve it as a new production template version. Additional script coverage needs suitable fonts and verification.
2. Program codes: done 2026-09-28. Program decision (owner, 2026-09-28): one live program, **MedTech Immersion Program** (slug `foundation-program`, code **FND**, ₹25,000 + 18% GST = ₹29,500, 6 weeks, online). Created in the new Supabase project `uhavtfhfebwwamltlmmq`. The Advanced Module is deferred; no ADV course or code exists. FND can still be changed (e.g. to IMM) before the first certificate is issued.
3. Approval gates: Clerk cutover, production migration, `live` email, www→apex, SPF/DKIM
   check, deploy.
4. Recommended: upgrade `next`, replace `xlsx`, move the passcode-gated legacy APIs to
   `requireStaff`, and add a Vercel Firewall rate-limit rule.
5. Phase 2 ideas: learner "My credentials", Add-to-LinkedIn button, Open Badges 3.0 export,
   a verifier API with keys, a scheduled digest of failed emails.

## Local development

```bash
# Postgres 16 on :5433, DB msc_dev; .env.local has DATABASE_URL/DIRECT_URL plus:
#   ADMIN_AUTH_MODE=dev DEV_AUTH_ENABLE=local-only CREDENTIAL_STORAGE=local
#   CREDENTIAL_PUBLIC_BASE_URL=http://localhost:3000 CREDENTIAL_EMAIL_MODE=off
npx tsx scripts/seed-public-courses.ts
npx tsx --conditions=react-server scripts/credentials-dev-seed.ts
npm test          # resets and migrates a *_test database only
```
