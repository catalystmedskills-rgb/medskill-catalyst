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

## P0 addendum (2026-10-04): credential types and internship completion certificates

Owner requirement: the same credential platform issues INTERNSHIP COMPLETION certificates. No separate application. Credentials have a type; the core internship issuance and verification workflow is **P0**. Owner decisions 2026-10-04: duration shows exact months + days (whole months, whole weeks under a month, otherwise "N Months D Days" / "N Days"); internships use one program, code **INT**.

Evidence: **T** `tests/unit/credential-types.test.ts`, `tests/integration/internship.test.ts`, `tests/unit/public-permissions-render.test.ts`; **DB** migration `20261004120000_credential_types`; **B** browser check on a local dev server against the local rehearsal database (4 Oct 2026: issue → review → preview → issue → public page → PDF → reissue → list filter → dashboard).

| # | Requirement | Priority | Status | Evidence |
|---|---|---|---|---|
| CT-01 | Credentials have a type; initial types COURSE_COMPLETION and INTERNSHIP_COMPLETION | P0 | PASS | DB enum + `credentials.credential_type`; T enum ⇔ registry match |
| CT-02 | New types (WORKSHOP, FELLOWSHIP, TRAINING, OBSERVERSHIP) addable without redesign | P0 | PASS (design) | One registry (`credential-types.ts`) + additive `ALTER TYPE … ADD VALUE`; details live in one validated JSON snapshot |
| CT-03 | Internship fields: name, email, internship name (typed per certificate; labelled "Internship name", owner 2026-10-04), department, start, end, optional hours, supervisor, mode (ON_SITE/REMOTE/HYBRID), location; issue date, ID, token, template version, status | P0 | PASS | T; B |
| CT-04 | Start/end dates are the source of truth; duration calculated, never entered; hours stored separately, never inferred | P0 | PASS | T (3 Months, 4 Weeks, 2 Months 15 Days, leap/month-end; a supplied "duration" is ignored in single and bulk) |
| CT-05 | Issue workflow: type first → internship fields → live calculated duration → review → certificate preview → issue → ID/token/QR/PDF/storage/email/verification | P0 | PASS | B; preview is POST-only, stamped PREVIEW, writes nothing |
| CT-06 | Dedicated internship template support; render title, department, start, end, period, duration, hours, ID, issue date, QR, signature | P0 | PASS (dev template) / PENDING artwork | Template fields `internship_title`, `department`, `start_date`, `end_date`, `internship_period`, `duration`, `total_hours`; activation refuses an internship template missing title, dates or duration (T). Final internship artwork: owner to supply |
| CT-07 | Authorized signature configured per template/program, not globally | P0 | PASS | Existing per-template `signatures` blocks (asset slot `asset4`) |
| CT-08 | Raw signature never exposed via a public storage URL | P0 | PASS in app / **FAIL in git** | Template assets live in the private `credentials` bucket (refuses a public bucket; T). **But** `assets/credentials/foundation-v1/signature-gagan-victor.png` is committed and the GitHub repo `catalystmedskills-rgb/medskill-catalyst` is public: the file is downloadable (HTTP 200, 4 Oct 2026). Owner decision required, see Known issues |
| CT-09 | Public page shows only approved fields: name, type, title, department, start, end, duration, ID, issue date, issuer, status | P0 | PASS | Allowlist in `publicInternshipDetails` + `toPublicCredential`; T and B confirm no email, supervisor, mode, location, hours or internal IDs on page or API |
| CT-10 | Same lifecycle: VALID, EXPIRED (when the program has validity), REVOKED, SUPERSEDED/REISSUED | P0 | PASS | T (reissue recomputes duration and supersedes; revoke); B (reissue) |
| CT-11 | Type and details frozen once issued; type always matches the program | P0 | PASS | DB guard (details/type immutable), insert trigger (type = program type), program-type lock once issued; T |
| CT-12 | Duplicate rule: same learner + program + internship title + start + end (case/spacing-insensitive) | P0 | PASS | T (single and bulk, in-file and against registry) |
| CT-13 | Bulk internship import (full_name, email, internship_name (internship_title also accepted), department, start_date, end_date, total_hours, supervisor, mode, location): upload → validate → duration → duplicates → preview → confirm → individual IDs/tokens/QR/PDF/email → row results | P0 | PASS | T (`bulk internship issuance`); per-type CSV template; results export adds title/dates/duration, no email for non-private roles |
| CT-14 | Registry, verification, admin search, audit and analytics include internships; search filters by type | P0 | PASS | Type filter + internship-title search (B: 2 of 6 local credentials); `credential_type` in issue/reissue/bulk audit metadata; dashboard "By credential type" |
| CT-15 | Don't block on internship artwork; integrate the final design when supplied | P0 | PASS | Watermarked dev internship template works end to end; final artwork = new template version upload |

## Addendum (2026-10-12): offer letters

Owner requirement: issue offer letters to incoming interns and campus ambassadors on the same
platform. Decisions and plan: `OFFER_LETTER_PLAN.md`. Evidence: **T** `tests/unit/offer-letters.test.ts`,
`tests/integration/offer-letters.test.ts`; **DB** migration `20261012120000_offer_letters`;
**B** local browser check 12 Oct 2026 (issue a Campus Ambassador letter → review → issue →
public page and API leak check → PDF → QR decodes to the letter's page).

| # | Requirement | Status | Evidence |
|---|---|---|---|
| OL-01 | Offer letter is a credential type; one program (OFR), offer type and role per letter | PASS | Registry + enum; T |
| OL-02 | Letter matches the owner's sample; wording per offer type, versioned in the template | PASS (Internship) / **owner approval** (Campus Ambassador wording) | Specimens; T renders both types and longest values |
| OL-03 | Recipient, institution, role, start date, duration, mode, optional stipend (paise, INR), greeting (first name, honorifics skipped) | PASS | T |
| OL-04 | Letter dated on issue; start date may be in the future | PASS | T |
| OL-05 | Public verification minimal: name, type, offer type, role, start date, issue date, status ("Withdrawn" when revoked) | PASS | T + B: no stipend, institution, mode, duration, greeting or email on page or API |
| OL-06 | Withdraw (revoke) and revise (reissue, carrying unchanged fields) | PASS | T |
| OL-07 | Duplicate rule: recipient + offer type + role + start date | PASS | T (single and bulk) |
| OL-08 | Bulk import with spreadsheet wording ("2 months", "CA", "monthly"); bad rows reported | PASS | T |
| OL-09 | Email: offer wording, role and start date only (no stipend) | PASS | T |
| OL-10 | Signature: Gagan Victor's authorized signature as Founder; stored privately | PASS in app | Private bucket; same git exposure as before (see Known issues) |

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

- **Signature in a public repository (found 2026-10-04, HIGH).** Gagan Victor's authorized signature (`assets/credentials/foundation-v1/signature-gagan-victor.png`, commit `0761720`) is publicly downloadable from the public GitHub repo `catalystmedskills-rgb/medskill-catalyst` (branch `feat/credentials`). The website and storage do not expose it. Options, all owner decisions: make the repository private (fastest, stops new exposure); remove the file from the branch and keep it only in a gitignored/private location; rewrite history (force push) to purge it; consider it already copied and decide whether to replace the signature asset. Production keeps its own copy in the private bucket, so issuance is unaffected by any of these.


1. `next@15.5.19` has a critical advisory in `npm audit`. It predates this work. Upgrade before launch.
2. `xlsx@0.18.5`, used by the existing leads export, has known CVEs. Bulk import doesn't use it (it uses exceljs). Replace it or install the SheetJS 0.20.3 release from their CDN.
3. The passcode-gated legacy APIs stay active in Clerk mode (see AUTH_ROLLOUT §6).
4. The app-level rate limiter counts per IP. Add the Vercel Firewall rule for volumetric abuse.
