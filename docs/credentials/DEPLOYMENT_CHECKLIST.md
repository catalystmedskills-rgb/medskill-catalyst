# Credential system: deployment checklist

Nothing below has been done to production. Each item marked **[GATE]** needs your approval.

Current evidence and blockers: see `RELEASE_READINESS_2026-09-27.md`. The signed Foundation package is ready for review, local checks pass, and dependencies are patched. The live Vercel project is accessible in the browser under `info-74073127`; the sibling's saved link is obsolete. Production credential/Clerk settings and an isolated Preview database are missing. The locally configured Supabase project is inactive, but its relationship to the live site remains unverified. Existing domain redirects point apex → www; verify the chosen canonical origin before changing redirects or issuing credentials.

## Environment variables

| Variable | Where | Value / notes |
|---|---|---|
| `CREDENTIAL_PUBLIC_BASE_URL` | Production | `https://medskillscatalyst.com` (required; issuance refuses to run without it on production) |
| `CREDENTIAL_EMAIL_MODE` | Production | `off` until the first real issuance, then `live` **[GATE]**. `live` is ignored on non-production deployments. |
| `CREDENTIAL_EMAIL_MODE=redirect` + `CREDENTIAL_EMAIL_REDIRECT_TO` | Preview | Sends every credential email to a QA inbox instead of the learner |
| `RESEND_API_KEY` | all | Already used by the site |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | all | Already set. PDFs go to a new **private** bucket `credentials`, created on first use; the app refuses to use it if it's public. |
| `DATABASE_URL` / `DIRECT_URL` | all | Already set |
| `ADMIN_AUTH_MODE`, Clerk keys, `BOOTSTRAP_ADMIN_EMAILS` | see AUTH_ROLLOUT.md | **[GATE]** |
| `CREDENTIAL_STORAGE`, `DEV_AUTH_ENABLE` | never on Vercel | Local development only; both are refused on Vercel |

## Database migration

`prisma/migrations/20260925120000_credentials/migration.sql` is **additive only**: a new
enum value (`ISSUER`), four nullable/defaulted columns on `courses`, six new tables,
indexes, triggers and RLS. Nothing is dropped or rewritten, and the migration is safe to
re-run (tested twice in a row).

1. Take a Supabase backup (Dashboard → Database → Backups), or confirm PITR is on.
2. `npx prisma migrate deploy` with `DIRECT_URL` pointing at production **[GATE]**.
3. Check: `select count(*) from credentials;` returns 0, and
   `select relrowsecurity from pg_class where relname='credentials';` returns `t`.

### Credential types / internships (2026-10-04) [GATE]

`prisma/migrations/20261004120000_credential_types/migration.sql` is **additive and
idempotent**: a `CredentialType` enum, `credential_type` columns (default
`COURSE_COMPLETION`) on `courses`, `credentials` and `credential_bulk_jobs`,
`credentials.details` (default `{}`), one index, a replaced `credentials_guard` (the
original rules plus type/details frozen once issued), and two new triggers (type must
match the program; a program's type is locked once it has issued). Every existing row,
including live certificates, becomes `COURSE_COMPLETION`; nothing is rewritten.

1. Backup first (the project has no automatic backups; take a `pg_dump`).
2. Deploy the release **and** apply the migration together: the new code reads the new
   columns. `npx prisma migrate deploy` with `DIRECT_URL` → production. **[GATE]**
3. Check: `select credential_type, count(*) from credentials group by 1;` shows only
   `COURSE_COMPLETION`, and the live certificate still verifies.
4. Internship program (owner): Programs → set the internship program's code (**INT**) and
   type **Internship completion** before it issues anything; then upload and activate the
   internship template (needs internship title, dates or period, and duration fields;
   signature in asset slot `asset4`).

Rollback: redeploy the previous release. The added columns are ignored by old code; the
replaced guard only adds checks. Do not drop the columns.

### Offer letters (2026-10-12) [GATE]

`prisma/migrations/20261012120000_offer_letters/migration.sql` adds one enum value
(`OFFER_LETTER`); additive and safe to re-run. **Apply it before deploying the release**
(deploying first breaks reads of the new type; see 2026-10-04). Then: create the program
(`scripts/create-offer-letter-program.ts`, code OFR), upload the template as a draft
(`scripts/upload-offer-letter-template.ts`), owner approves the preview and the Campus
Ambassador wording, then `--activate`. Smoke test: issue one letter to the owner, check
email/PDF/QR/public page, withdraw it.

## Before the first real credential

1. **Program codes:** Admin → Credentials → Programs. Set codes for the real programs.
   Done 2026-09-28: MedTech Immersion Program = FND (the only live program; Advanced deferred).
2. **Approved artwork:** upload it as a new template version (Templates → Upload). Tick
   "production", preview it, then activate. The development template can't issue on
   production.
3. **Sending domain:** confirm SPF, DKIM and DMARC for `medskillscatalyst.com` in Resend
   (Domains page shows "Verified") **[GATE: DNS]**.
4. **www → apex:** set `www.medskillscatalyst.com` to redirect to
   `medskillscatalyst.com` in Vercel → Domains **[GATE: DNS/domain]**. I deliberately
   didn't add a code-level redirect, because it would loop if Vercel already redirects
   the other way.
5. **Rate limiting:** add a Vercel Firewall rule, e.g. 60 req/min per IP on `/verify/*`
   and `/api/verify/*`, in front of the app-level limiter.
6. Dependency hardening completed locally: Next.js 15.5.26, SheetJS removed, full npm audit reports zero vulnerabilities. Run CI on the release commit and review `RELEASE_READINESS_2026-09-27.md` before deployment.

## Production smoke test (after deploy) [GATE]

1. With an individual admin login, issue one credential to an internal email (email mode
   `off`) and open its detail page.
2. Scan the QR on the PDF with a phone and confirm it opens the verification page, not
   signed in.
3. Enter the certificate ID at `/verify` in lower case and confirm it lands on the same page.
4. Check `curl -sI https://medskillscatalyst.com/verify` shows `X-Robots-Tag: noindex`.
5. Revoke it and confirm the page shows **Revoked** with no reason, and the PDF link returns 404.
6. Switch email to `live`, issue to a staff inbox and check it arrives with SPF/DKIM pass.

## Rollback

- Code: redeploy the previous deployment. The new tables are simply unused.
- Auth: unset `ADMIN_AUTH_MODE`.
- Email: set `CREDENTIAL_EMAIL_MODE=off`.
- Data: credentials are never deleted. Revoke any issued in error.
