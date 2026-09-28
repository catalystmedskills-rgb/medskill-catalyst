# PRD acceptance matrix and security review

Update 2026-09-27: the signed Foundation adaptation is packaged and verified locally; owner authorized Gagan's supplied signature. Final production activation remains pending. Tests now total 106, type-check/build pass, and full npm audit reports zero vulnerabilities. Framework/SheetJS findings and Clerk-mode legacy API bypasses listed in the historical review below have been fixed. See `RELEASE_READINESS_2026-09-27.md` for current evidence and live blockers; the deployment smoke test is still open.

Evidence key: **T** automated test (`tests/`), **E2E** real browser against a production
build (25 Sep 2026), **DB** enforced by database constraint/trigger.

## PRD §16 acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| One credential issued exactly once, with unique certificate ID and token | PASS | T `issuance.test.ts` (idempotency, 6 concurrent double-submits, 50k ID sample); DB unique indexes |
| Certificate visually matches the approved template, with correct data and a scannable QR | **PARTIAL** | The pipeline, data, fit rules and QR are proven (T: QR rasterized at 150 dpi and decoded to the exact URL). The approved artwork is still pending, so this is only met on the dev template. |
| Scanning the QR opens the canonical public page without login | PASS | T QR decode; E2E |
| Exact certificate ID at /verify resolves to the same credential | PASS | T; E2E (lower case with spaces → same URL) |
| Public verification never returns email or internal IDs | PASS | T allowlist test and route test; E2E page scan |
| Issuance sends/queues email and records delivery status | PASS | T (sent / failed / suppressed, redirect mode) |
| Bulk identifies invalid rows before issuance and reports row-level results | PASS | T `bulk.test.ts`; E2E |
| Revoking changes public status without deleting the record or history | PASS | T; DB delete-guard trigger; E2E |
| Reissuing creates a new credential and preserves the relationship | PASS | T (atomic supersede, revoked-parent path); E2E |
| Unauthorized users can't reach admin actions; public endpoints can't enumerate | PASS | T role matrix via real route handlers; miss-based rate limit; 128-bit tokens |
| Retries/idempotency never create duplicates | PASS | T single, concurrent, bulk concurrent processors, bulk retry |
| Critical flows have automated tests and a production smoke test | PARTIAL | 87 automated tests pass. The production smoke test is a deployment gate (checklist). |

## Functional requirements

FR-01 through FR-16: **PASS**, except FR-01, which is PASS in code and awaits your approval
of the Clerk cutover. FR-08 is PARTIAL until the artwork arrives. FR-17 (basic counts):
**PASS** on the Overview page. FR-18 (learner accounts): **N/A**, a later phase.

## Security review

| Check | Finding |
|---|---|
| Broken authorization | Every page, action and API authorizes itself on the server. Page-level gates were added after I found that layouts don't protect pages that render in parallel. |
| Exposed secrets | Service keys are server-only (`server-only` imports). Stored error text redacts URLs and keys. Nothing in `NEXT_PUBLIC_*`. |
| IDOR | Admin resources are reached by UUID, always behind a permission check. Public access is by token or exact ID only. |
| Learner enumeration | No name or email search in public. Failed lookups are rate-limited per client (20 per 10 min). Tokens are 128-bit. Every miss gives the same answer. |
| Predictable tokens | `crypto.randomBytes(16)`. Certificate IDs use `crypto.randomInt` and are never sequential. |
| SQL injection | Prisma parameterized queries. Raw SQL uses tagged templates only. Inputs are validated with format checks before any query. |
| Unsafe file access | Storage keys are pattern-checked and path-resolved. Uploads are typed by magic bytes. Files are content-addressed and never overwritten. |
| XSS | React escaping. No `dangerouslySetInnerHTML` in new code. Every email field is escaped (tested). |
| CSRF | Server actions use Next's built-in origin check. JSON APIs require `application/json` plus same-origin (tested). |
| PII exposure | Public field allowlist. Meta Pixel and GA are **disabled on /verify** (the token-bearing URL would otherwise go to Meta and Google). `Referrer-Policy: no-referrer`. |
| Privilege escalation | Staff management is ADMIN-only. Dev impersonation is refused on Vercel. Unverified Clerk emails are never trusted. |
| Duplicate-issuance races | Partial unique index plus idempotency keys, tested under concurrency. A same-key race that could show a misleading "duplicate" message was found and fixed. |
| Public storage exposure | Private bucket, and the app fails closed if it's public. PDFs stream through the app, and only for VALID/EXPIRED credentials. |
| Unsafe error messages | Only safe messages reach the UI. Database errors are logged server-side. |
| Spreadsheet formula injection | Export cells starting with = + - @ are neutralized (tested). |

### Known, not fixed (need decisions)

1. `next@15.5.19` has a critical advisory in `npm audit`. It predates this work. Upgrade before launch.
2. `xlsx@0.18.5`, used by the existing leads export, has known CVEs. Bulk import doesn't use it (it uses exceljs). Replace it or install the SheetJS 0.20.3 release from their CDN.
3. The passcode-gated legacy APIs stay active in Clerk mode (see AUTH_ROLLOUT §6).
4. The app-level rate limiter counts per IP. Add the Vercel Firewall rule for volumetric abuse.
