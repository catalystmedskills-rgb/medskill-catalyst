# CLAUDE.md: MedSkills Catalyst

Guidance for Claude Code in this repo. Read it before changing anything.

## The app

- Next.js 15 (App Router, `src/app`) plus a legacy static marketing site in `public/` (served via rewrites in `next.config.ts`). Hosted on Vercel.
- Supabase Postgres through **Prisma 7** (`prisma/schema.prisma`, generated client in `src/generated/prisma`; import it as `@/src/generated/prisma/client`). Runtime uses `DATABASE_URL` (pooler); migrations use `DIRECT_URL`.
- Supabase Storage (private buckets) through the service-role client in `src/lib/supabase.ts`. Server-only.
- Email through Resend (`src/lib/email.ts`).
- Brand rules live in `BRAND.md`: colors, Fraunces + Plus Jakarta Sans, accessibility rules. The admin UI uses the Tailwind tokens (`brand-navy`, `brand-blue`, `rounded-msc`, `shadow-msc-*`).
- Path alias: `@/` = repo root, so `@/src/lib/db`.

## Commands

```bash
npm run dev            # next dev
npm run type-check     # tsc --noEmit
npm test               # vitest; needs a local Postgres DB whose name ends in _test (see below)
npm run build          # prisma generate && next build
npx prisma migrate deploy   # DIRECT_URL target. NEVER run against production without explicit approval
```

Tests (`tests/`) rebuild a database named `*_test` from `prisma/migrations/*` on every run (`tests/global-setup.ts`). They refuse to touch any database whose name doesn't end in `_test`. Default URL: `postgresql://postgres@localhost:5433/msc_test`. Override with `TEST_DATABASE_URL`, either in the environment or in a gitignored `.env.test.local` (loaded by `vitest.config.ts`; an environment variable wins over the file).

Scripts that import server modules need the react-server condition:
`npx tsx --conditions=react-server scripts/<script>.ts`

## Current work: Credential Issuance & Verification System (branch `feat/credentials`)

The source of truth is the PRD plus the docs in `docs/credentials/`. **Read these first:**

- `docs/credentials/IMPLEMENTATION_LOG.md`: architecture, what was built, assumptions, remaining work
- `docs/credentials/AUTH_ROLLOUT.md`: Clerk cutover plan (**approval gate**)
- `docs/credentials/DEPLOYMENT_CHECKLIST.md`: env vars, migration, smoke test
- `docs/credentials/ACCEPTANCE_AND_SECURITY.md`: PRD acceptance matrix and security review

Status: hardened release candidate; Foundation package includes Gagan Victor's authorized signature in asset4. 106 tests pass, type-check/build pass and npm audit reports zero vulnerabilities. See `docs/credentials/RELEASE_READINESS_2026-09-27.md` for live blockers and rollout. Nothing is deployed, migrated or emailed.

Where things live:

| Area | Path |
|---|---|
| Core logic (issue, render, verify, bulk, lifecycle) | `src/modules/credentials/` (start with `service.ts`, `config.ts`) |
| Permissions matrix (single source) | `src/lib/permissions.ts` |
| Auth modes (passcode / clerk / local dev) | `src/lib/auth.ts`, `src/lib/auth-mode.ts`, `src/middleware.ts` |
| Admin UI | `src/app/admin/credentials/**`, `src/app/admin/staff` |
| Public verification | `src/app/verify/**`, `src/app/api/verify/**` |
| PRD JSON API | `src/app/api/credentials/**` |
| Migration | `prisma/migrations/20260925120000_credentials/migration.sql` |

### Invariants: do not break these

1. **The registry is the source of truth.** A credential is public only when `status` is VALID/REVOKED/SUPERSEDED. ISSUING and FAILED always look like "not found" publicly.
2. **Public output goes through `toPublicCredential()`** (`src/modules/credentials/public.ts`) and nothing else. Never return database rows from public routes, and never expose email, internal ids or revocation reasons.
3. **EXPIRED is derived at read time** (`status.ts`). Don't store it, and don't add a cron job to set it.
4. **Everything is idempotent.** Issuance requires an idempotency key, and bulk rows use `bulk:<jobId>:<row>`. Keep these deterministic.
5. **The database enforces lifecycle** through triggers: no deletes, no edits to identifiers or printed content after issue, REVOKED and SUPERSEDED are terminal, `credential_events` is append-only, and active templates are frozen. Don't work around them: reissue instead of editing, and create a new template version instead of changing one.
6. **Authorization runs server-side in every page, action and route** (`requirePermission`), checked against the matrix. Layout gates alone are not enough. Credential writes require an individual identity (`{ individual: true }`).
7. **Migrations are additive and idempotent** (`IF NOT EXISTS`, guarded `DO` blocks). No drops or renames.
8. Certificate ID format and the canonical URL come from `config.ts` / env only. Never hard-code a domain.
9. Tracking pixels and GA stay off `/verify*` (`src/lib/tracking-exclusions.ts`).

### Approval gates: ask the owner (Areeb) before any of these

Production deploy · applying migrations to production · switching `ADMIN_AUTH_MODE=clerk` in production · `CREDENTIAL_EMAIL_MODE=live` or emailing real learners · DNS/domain changes (www→apex, SPF/DKIM) · deleting or replacing production data or certificate files · exposing any learner data publicly. Prepare everything; don't execute these.

### Next tasks (in order)

1. Review/upload `assets/credentials/foundation-v1/` as a new template version (instructions in its README). Gagan's signature use is authorized and its PNG must be uploaded as asset4. The builder uses the generic renderer and real QR. Check font coverage for non-Latin names.
2. Done 2026-09-28. Program decision (owner, 2026-09-28): one live program, **MedTech Immersion Program** (slug `foundation-program`, code **FND**, ₹25,000 + 18% GST = ₹29,500, 6 weeks, online). Created in the new Supabase project `uhavtfhfebwwamltlmmq`. The Advanced Module is deferred; no ADV course or code exists. FND can still be changed (e.g. to IMM) before the first certificate is issued.
3. After approval: Clerk cutover (follow `AUTH_ROLLOUT.md` exactly), production migration, smoke test.
4. Hardening: done in code on 2026-09-27 (`next` 15.5.26, SheetJS replaced by ExcelJS with formula neutralisation, the legacy `/api/careers/admin` and `/api/invoices*` routes require `requireStaff` in Clerk mode; `npm audit --omit=dev` reports 0). Still open, needs owner approval as it is remote infrastructure: a Vercel Firewall rate-limit rule on `/verify*`.

## Working style the owner expects

- Be a direct critic: flag weak ideas and systemic gaps, and propose better options.
- Don't invent business rules. Record unknowns as TBD and ask.
- Run type-check, tests and build after each significant change. Report honestly what was and wasn't verified.
