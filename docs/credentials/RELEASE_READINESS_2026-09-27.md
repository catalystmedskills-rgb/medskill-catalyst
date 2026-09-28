# Certificate release readiness — 27 September 2026

Status: hardened release candidate, locally verified; **not yet ready for production learner issuance**. Infrastructure, authentication rehearsal and rollout gates remain open.

## Completed

- Foundation upload package includes Gagan Victor's supplied, authorized signature in `asset4`. Both signed specimens render correctly and their QR codes decode at 150 dpi. The small source image limits print sharpness; higher-resolution replacement is optional and must be authentic.
- Tests now upload all four assets and issue a credential through the real pipeline using an isolated test database, local storage and no email.
- Website brand fonts are bundled with their SIL OFL licenses and shared by both routers. A clean build exposed an upstream Google Fonts URL parsing failure; local fonts remove that build-time dependency while retaining Fraunces and Plus Jakarta Sans.
- Next.js 15.5.26; Prisma CLI/client/adapter aligned at 7.10.0; SheetJS removed. ExcelJS handles leads exports with formula neutralization, COUNSELOR authorization and no-store responses.
- Dependency overrides: PostCSS 8.5.28, ExcelJS's UUID 11.1.1, Prisma config's deepmerge-ts 8.0.2, Prisma's mysql2 3.24.4. The used APIs pass generation, database tests and build. Review overrides when upgrading parents. Full and production-only audits report zero vulnerabilities.
- Clerk-mode careers/invoice APIs require staff roles and reject shared-passcode access; mutating requests require same-origin JSON. Legacy `/api/leads` returns 410 in Clerk mode; use the CRM/export. Passcode mode remains available for rollback.
- Private storage checks fail closed, recheck bucket-creation races and do not cache stale privacy metadata across accesses.
- Custom-font missing glyphs block issuance instead of silently printing boxes. This does not add support for scripts absent from the fonts.
- CI workflow added with isolated Postgres 17, real migrations, type-check, tests, build and audit. Not yet run on GitHub.
- Read-only preflight added: `npm run credentials:preflight -- --env /absolute/path/to/environment-file`. It never migrates, uploads, activates or emails; values are hidden. Automated success does not replace manual launch gates.

## Validation

106 tests across 10 files, type-check and production build pass. Signed short/long-name specimens visually reviewed and QR-decoded. Full dependency audit: zero vulnerabilities. The previous metadataBase build warning is resolved; Vite config-loader and webpack cache-performance warnings remain non-blocking.

Local production-server HTTP smoke: `/verify` returns 200; invalid-token API returns 404; both have noindex/no-store headers. Unauthenticated credential POST and leads export return 401. No live Clerk sign-in or production smoke test has been performed.

Clean install reproduced with `npm ci`. An initial extraction warning reported local disk exhaustion; clearing only this project's generated `.next/cache` allowed a clean rerun without the disk warning. User data and source files were preserved. The machine remains low on free disk space.

## Live blockers observed read-only

### Step 1 follow-up: live database verification

Vercel CLI now authenticates as `info-74073127` and can inspect the correct project. Its DATABASE_URL entry is shared by Production and Development; pulling the Development value and inspecting only its host/project reference confirms `bvsjrlbnihwhiguchcnf` in Tokyo (transaction pooler port 6543). Production secret values remain protected by Vercel. No credentials were printed or committed.

The Supabase dashboard confirms the project is paused, data/backups/storage are retained, and database (Postgres 17.6.1.141) and storage backup downloads are offered. This establishes backup availability, not restore integrity or an automated backup retention policy. A resume attempt was rejected because the account already has two active free projects (`vertical-express` and `vertical-express-staging`). No project resumed and no schema/data changes occurred. Owner decision required: upgrade the organization, or explicitly choose an existing project to pause. Do not pause unrelated applications automatically. Database connectivity, migration history and backup restore validation remain pending.

The follow-up above supersedes the earlier inactive-project/CLI-access uncertainty below.

1. Supabase `bvsjrlbnihwhiguchcnf` (Medskills Catalyst) reports **INACTIVE**. The sibling project's local configuration targets it and database/storage preflight fails. Its relationship to the current live project is unverified; confirm the live database target before restoring or migrating anything. Verify backups and preserve existing data.
2. Browser inspection found the actual live [Vercel project](https://vercel.com/info-74073127/medskill-catalyst): project `prj_5EPPA3NJFlWlpImuEVO9SebzHqwM`, team `team_ewslK4WbHH9zMb9ehB9DJQI1`, scope `info-74073127`. Production tracks `main`, currently commit `0d42006`. The sibling's saved project/team IDs are obsolete for this live site. Browser access works; the CLI is signed into a different account. Do not deploy through that stale local link.
3. Apex `/verify` redirects to `www`, which returns 404. This release is not live. Resolve the canonical domain before issuing permanent QR links. Documentation previously chose apex; avoid a code redirect that loops with Vercel's current direction.
4. The live project's environment inventory contains database/Supabase/passcode settings, but no Clerk keys, credential origin, credential email mode, admin bootstrap allowlist or DIRECT_URL. No shared variables are linked. DATABASE_URL is scoped to Production and Development, so an isolated Preview database is also needed. Values were not revealed; database identity, migration history and storage privacy remain unverified. The sibling's local copy has non-production Clerk keys and must not be treated as production configuration.

## Step 3 rehearsal — 2026-09-28 (local, throwaway database)

Run on local Postgres 17, database `msc_rehearsal` (disposable; not `msc_test`, not production), `ADMIN_AUTH_MODE=dev`, local storage, `CREDENTIAL_EMAIL_MODE=off`. Program mirrored from production: MedTech Immersion Program, code FND.

| Check | Result |
|---|---|
| Admin uploads Foundation v1 artwork (background + 3 fonts + Gagan's signature + layout), preview, activate | PASS: v2 active, dev template retired |
| Issuer issues single credential via /admin/credentials/issue | PASS: MSC-2026-FND-VCWBTQ; PDF hash matches record; visually correct |
| QR decodes (150 dpi) to printed verify URL | PASS |
| Public /verify by link and by lowercase ID; fake token | PASS: Valid; noindex + no-store; fake shows "not found" (API 404) |
| Logged-out visitor on admin | PASS: sign-in screen, no form |
| Viewer cannot issue or revoke; Accounts can issue but not revoke (as documented) | PASS |
| Admin reissue (name correction) | PASS: MSC-2026-FND-AJRHKF; original shows "Replaced", no PDF |
| Revoke: wrong ID refused; correct ID revokes; public shows Revoked, no PDF, reason hidden | PASS |
| Bulk CSV: 2 valid + 1 US-format date | PASS: bad row blocked in preview; 2 issued (Q2FVYR, J9AZNC); nothing before confirm |
| Email off | PASS: one delivery row, SUPPRESSED; nothing sent |

Not covered: Clerk sign-in (no Clerk instance yet), Supabase private storage (local storage used), live email.

Findings to decide/fix before launch:
1. FIXED 2026-09-28: the email checkbox on Issue, Reissue and Bulk is now unticked by default (issuers opt in per credential).
2. FIXED 2026-09-28: revoke confirmation uses `normalizeCertificateId` on both sides (case, spaces and dash variants ignored); wrong or empty IDs are still refused. Verified in the browser; 106 tests + type-check pass.
3. Dev-mode "Sign out" does not clear the dev identity (local-only; no production impact).

## Production database switch — 2026-09-28 (pending owner action)

New Supabase project `uhavtfhfebwwamltlmmq` has all 7 migrations and 79 leads; students/orders/files from the old project were not migrated. Vercel production still points at the paused old project. Update `DATABASE_URL` (transaction pooler, port 6543), `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` together, then redeploy. Automated change was blocked by permissions; owner to apply.

Email: Resend MCP added to Claude Code (needs sign-in). Vercel has no `RESEND_API_KEY` yet. Test plan: `CREDENTIAL_EMAIL_MODE=redirect` with `CREDENTIAL_EMAIL_REDIRECT_TO=info@medskillscatalyst.com`; confirm medskillscatalyst.com is verified (SPF/DKIM) in Resend before any `live` use.

Email redirect test — 2026-09-28: PASS. Resend reports medskillscatalyst.com **verified**, sending enabled (region ap-northeast-1). Created a send-only Resend key `medskill-credentials-local-dev` restricted to that domain; stored only in local `.env.local` (gitignored), not on Vercel. Resent MSC-2026-FND-Q2FVYR through the real `resendCredential` path against `msc_rehearsal` in redirect mode: delivery row SENT to info@medskillscatalyst.com, Resend status **delivered**. Links in the email point to `http://localhost:3000` because `CREDENTIAL_PUBLIC_BASE_URL` is unset locally; production must set it to `https://medskillscatalyst.com`. Still open: a separate production key in Vercel (do not reuse the local-dev key), and `live` mode remains an approval gate.

## Production readiness pass — 2026-09-28 (autonomous, no deploy)

Production email configuration (Vercel project `info-74073127/medskill-catalyst`, Production scope):

| Item | Status | Evidence |
|---|---|---|
| `CREDENTIAL_PUBLIC_BASE_URL=https://medskillscatalyst.com` | PASS | Added via CLI (type Config, Production only). Takes effect on next deploy. |
| `CREDENTIAL_EMAIL_MODE=off` | PASS | Added explicitly (Secret, Production only). `live` not set; the approval gate is untouched. |
| Separate production Resend key | PASS | Owner installed the Resend Vercel integration at 19:45 UTC; Resend lists key "Vercel Integration", distinct from `medskill-credentials-local-dev`. Vercel `RESEND_API_KEY` is set for Production/Preview/Development by that integration. No new key created, and the local key is not on Vercel. Preview/Development stay effectively `off` (live is ignored outside production). |
| Verify without emailing a learner | PASS | Read-only preflight with the production origin and `off` mode reports "Email configuration" and "Canonical HTTPS origin" as PASS. No email sent. |

CLI access and database identity:

| Item | Status | Evidence |
|---|---|---|
| CLI aligned with the live project | PASS | `vercel whoami` = `info-74073127`; `env ls`/`ls --prod` work on `medskill-catalyst`. Repo has no `.vercel` link, so always pass `--scope info-74073127 --project medskill-catalyst`. Latest production deployment is Ready (6h old); www homepage 200. |
| New database identity | PASS | `.env.migration.local` targets ref `uhavtfhfebwwamltlmmq` (pooler aws-0-ap-northeast-2), PostgreSQL 17.6, reachable. |
| Migration state | PASS | 7/7 repo migrations applied, all finished, 0 rolled back; preflight confirms every checksum matches this release. |
| Schema guards | PASS | RLS enabled on all 26 public tables; 4/4 lifecycle triggers present. |
| Data | PASS (as expected) | 79 leads; 0 students, enrollments, credentials, templates and staff; course FND "MedTech Immersion Program" active at 2,500,000 paise. |
| Storage buckets | BLOCKED | `storage.buckets` is empty (no `credentials`, careers or enrollment buckets). Preflight's private-bucket check can't run: no service-role key for this project exists locally (`.env.server-key.local` empty) and the Supabase MCP account can't see this project (different org). Not created by us, to avoid mutating production. |
| Backups / PITR | BLOCKED | No management access to the project's org from CLI/MCP. Owner must check Database → Backups (free plan has no PITR). The old paused project `bvsjrlbnihwhiguchcnf` still holds the unmigrated students/orders/files; keep it and download its backup before any deletion. |
| Vercel production database switch | BLOCKED | Production `DATABASE_URL` is a protected secret (can't confirm the target); the service-role key for the new project isn't available, and `DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must change together. Owner applies, then redeploys (deploy is an approval gate). |
| Canonical domain | BLOCKED | Apex returns 308 to `www` for every path; `www/verify` and `www/api/verify/*` return 404 (release not deployed). QR links on the apex would still resolve via the 308 after deploy, but the owner should either make the apex primary in Vercel Domains or switch the origin to `https://www.medskillscatalyst.com` **before the first certificate**. The CLI account has no domain access (DNS/domain gate). |

Preflight (read-only) against the new database with production origin and email off: every migration, RLS, guard, origin and email check PASSES. BLOCKED: `DIRECT_URL`, `SUPABASE_SERVICE_ROLE_KEY` (not available locally), Clerk production keys and `ADMIN_AUTH_MODE=clerk`, Foundation active production template, and individual admin/bootstrap allowlist. The template and admin items are expected until cutover.

Regression after changes: type-check PASS; 106/106 tests PASS (10 files). Code unchanged in this pass; only Vercel env and this document changed.

## Rollout still required

1. ~~Align CLI access, confirm database identity/availability and migration history~~ PASS 2026-09-28 (see the readiness pass above). Backups/PITR and storage buckets remain BLOCKED on owner dashboard access.
2. ~~Confirm program codes~~ Done 2026-09-28: Program decision (owner, 2026-09-28): one live program, **MedTech Immersion Program** (slug `foundation-program`, code **FND**, ₹25,000 + 18% GST = ₹29,500, 6 weeks, online). Created in the new Supabase project `uhavtfhfebwwamltlmmq`. The Advanced Module is deferred; no ADV course or code exists. FND can still be changed (e.g. to IMM) before the first certificate is issued. Final signed artwork remains to be uploaded; Gagan's signature-use authorization is already confirmed.
3. Rehearse with an isolated staging database/private storage, Clerk development instance and email off: admin bootstrap, issuer sign-in, upload, single/bulk issuance, verification, revocation/reissue and permission denials.
4. Prepare production Clerk keys, bootstrap allowlist, canonical origin and email off. Verify sending domain and configure firewall limits on `/verify*` and `/api/verify*`.
5. Obtain the existing production-change approval (`CLAUDE.md:66`), apply additive migrations through DIRECT_URL, deploy and perform Clerk cutover as rehearsed. Run preflight against actual production settings.
6. Upload background, fonts in asset1–3, authorized signature in asset4 and layout JSON. Preview/approve/activate the new template; set approved program codes.
7. Smoke-test production with an internal specimen and email off, including phone QR scan and revocation. Enable live email only after approval and delivery verification.

Rollback: redeploy the previous release, restore previous auth settings and keep email off. Preserve issued records and PDFs; revoke mistakes rather than deleting them.

No production migration, deployment, DNS change, auth cutover, real issuance, email or remote template activation was performed. The only production change: two Vercel Production env vars added on 2026-09-28 (`CREDENTIAL_PUBLIC_BASE_URL`, `CREDENTIAL_EMAIL_MODE=off`), inert until the next deploy.

Reference: [Next.js 15.5.26 hardening release](https://nextjs.org/blog/nextjs-security-update-september-22-2026).
