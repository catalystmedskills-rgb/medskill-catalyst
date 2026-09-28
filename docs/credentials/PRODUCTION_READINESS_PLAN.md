# Certificate production readiness — 2026-09-27

Scope authorized: prepare the certificate system for production, fix verified launch blockers, validate the release candidate. Preserve existing certificate adaptation and production data.

## Implementation

- [MODIFY] `package.json`, `package-lock.json`: patch Next.js within 15.x; remove vulnerable SheetJS; update compatible vulnerable transitive dependencies and document any remaining exposure.
- [MODIFY] `src/app/api/admin/leads/export/route.ts`: use existing ExcelJS, enforce CRM role access, neutralize spreadsheet formulas.
- [MODIFY] credential storage/configuration: fix any confirmed failure to enforce private storage and production configuration.
- [NEW] focused regression tests for hardening changes.
- [NEW] CI workflow using isolated Postgres and real migrations, tests, type-check and build.
- [NEW] read-only production preflight command and documented deployment/rollback evidence.
- [MODIFY] deployment and handoff documentation: current results, owner inputs, live blockers.

## Validation

Run dependency audit; type-check; all tests; production build; local HTTP smoke checks. Inspect live infrastructure read-only where access is available. Do not claim production readiness based solely on a successful build.

## Owner inputs / release gates

- Program codes and signature choice requested asynchronously.
- Existing `CLAUDE.md` gates still apply to production migration/deploy, auth cutover, live email and public learner issuance. Prepare exact actions before requesting approval.
- Initial Supabase inventory reports Medskills Catalyst (`bvsjrlbnihwhiguchcnf`) INACTIVE; establish whether the deployed environment still targets it before proceeding.
