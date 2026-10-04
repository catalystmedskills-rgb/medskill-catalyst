# Internship certificate: design, build and go-live plan (2026-10-04)

Owner direction: internship certificates use **the same design as the course certificate**
(Foundation design v1, live in production since 2026-09-28). Then make it live so internship
certificates can be issued.

## 1. Design: the smallest change that makes it an internship certificate

Brief: visual identity is fixed. Same page, palette, typefaces, logo, watermark, frame,
ribbon, seal, signature block and QR. The design work is choosing *which words change* and
*where the internship's data sits*, so a reader can tell at a glance it is an internship,
and the two certificates still read as one family.

Tokens (unchanged, from the Foundation package):

| Token | Value | Use |
|---|---|---|
| Navy | `#0A2A43` | titles, name, ribbon, seal |
| Blue | `#00589E` | rule under title, verify link, frame inner line |
| Cyan | `#4AD0FF` | ribbon tick, seal ring |
| Slate | `#5A6B7B` | supporting lines |
| Serif | Cormorant Garamond 600 | "CERTIFICATE OF COMPLETION", learner name |
| Sans | Instrument Sans 400/600 | everything else |

Changes from the course certificate (everything else is pixel-identical):

| Element | Course (live) | Internship |
|---|---|---|
| Ribbon text | COURSE / CERTIFICATE | INTERNSHIP / CERTIFICATE (centred in the ribbon) |
| Line under the name | For successfully completing the online course | For successfully completing the internship |
| Prominent line (26 pt sans 600) | program name ("MedTech Immersion Program") | **internship name, typed per certificate** ("Clinical Research Internship") |
| Under it (12 pt slate) | — | Department: Clinical Operations (only when given) |
| Dates line (15 pt slate) | Course completed on 26 September 2026 | 1 June 2026 – 31 August 2026 |
| Same line, right (15 pt navy 600) | — | 3 Months (calculated) |
| Small line (12 pt slate) | Issued on … · Valid until … | Issued on 4 October 2026 · Total 480 hours (only when given) |
| Program name | printed | not printed (the ribbon says "Internship"; the program is on the verification page) |
| Signature, signatory, seal, QR, ID, link | — | unchanged (Gagan Victor, Academic Director) |

Layout (design px on the 1123 × 794 page; the builder converts to PDF points):

```
 logo                                              ┌ribbon┐
 CERTIFICATE                                        INTERNSHIP
 OF COMPLETION                                      CERTIFICATE
 ───
 Presented to
 Learner Name (serif 56, up to 2 lines)                 (seal)
 For successfully completing the internship
 Internship Name (sans 600 26, 1 line, shrinks to 16)
 Department: …                         (12 slate)
 1 June 2026 – 31 August 2026   3 Months   (15)
 Issued on 4 October 2026     Total 480 hours (12)
 [signature]                                   verify link   [QR]
 Gagan Victor / Academic Director              ID · MSC-…-INT-…
```

Fit rules: the internship name takes one line and shrinks to 16 pt; a longer name is refused
at review (preflight) with a clear message rather than overflowing. The learner name keeps
the course rules (2 lines, shrink to 60 %).

Self-review against the brief: no new colours, no new type, no new ornaments. The only
visible differences are the words that must differ. That is the point: a recruiter who has
seen one MedSkills certificate recognises the other.

## 2. Engineering

1. `scripts/build-foundation-template.ts` → share the artwork code with a new
   `scripts/build-internship-template.ts` (one `drawCertificateArtwork(variant)` so the two
   can't drift). Output `assets/credentials/internship-v1/` (background.pdf, layout.json,
   README) and labelled specimens in `output/pdf/` (short, long and no-optional-field cases).
2. Fonts: same three TTFs. Signature: **reuse** `foundation-v1/signature-gagan-victor.png`;
   do not add a second copy to git (the repo is public; see the signature issue).
3. Template schema: `program_name` becomes optional in the shared schema and required for
   course templates by the activation check (as `completion_date` already is). Internship
   templates still must have name, dates/period and duration.
4. Tests: render both variants; the internship layout passes preflight with the longest
   allowed values; activation of the package as an internship template succeeds and as a
   course template fails.
5. Gates: type-check, full test suite, production build, audit.

## 3. Go-live runbook (production; owner-approved 2026-10-04)

| Step | Action | Check | Rollback |
|---|---|---|---|
| G1 | Commit the work on `feat/credentials` | clean tree | — |
| G2 | `pg_dump` production (no automatic backups exist) | dump restores locally | — |
| G3 | `prisma migrate deploy` → `20261004120000_credential_types` | 8/8 migrations; live cert still COURSE_COMPLETION and verifies | columns are additive; leave them |
| G4 | Deploy the release to Vercel production (CLI, scope `info-74073127`) | build Ready; `/verify/<live cert>` 200; admin loads | redeploy previous deployment |
| G5 | Create the internship program in production (code **INT**, type Internship completion) | Programs page shows it | deactivate it |
| G6 | Upload `internship-v1` as a draft template; preview; activate | preview PDF matches the specimen; QR decodes | retire the template |
| G7 | Smoke test: issue one internship certificate, email it, verify, (revoke per owner) | email delivered; public page; PDF | revoke |

Blocking inputs for G5–G7 are asked of the owner before starting (program name, smoke-test
policy, how the template upload is authorised: the production service-role key is not on
this machine).
