# Offer letters on the credential platform: plan (2026-10-12)

Owner requirement: issue **offer letters** to incoming interns and campus ambassadors the
way certificates are issued. Sample: `MedSkills Offer Letter Template.pdf` (A4 portrait,
Instrument Sans + Inter Tight Italic, one page).

## Decisions (owner, 2026-10-12)

| Topic | Decision |
|---|---|
| Programs | One program, **MedSkills Offer Letters** (code **OFR**), type `OFFER_LETTER`; the role is typed per letter |
| Offer type | Each letter is **Internship** or **Campus Ambassador**; the type picks the letter's wording |
| Ambassador wording | Drafted from the intern sample; **owner approves before activation** |
| Verification | QR + public page, minimal: name, document type, offer type, role, start date, issue date, status ("Withdrawn" when revoked) |
| Acceptance | Out of the system (issue and email only) |
| Stipend | Optional; printed on the letter only, never public |
| Signature | Gagan Victor's approved signature, as "Founder, MedSkills Catalyst" |
| Ref | The system ID, e.g. `MSC-2026-OFR-7K4P92` (random, verifiable) |
| Dates on the letter | DD/MM/YYYY, as in the sample |

## Data per letter (validated, frozen once issued)

recipient name and email, offer type, role, institution (optional), start date, duration
(number + weeks/months), mode (Remote / On-site / Hybrid), stipend (optional: amount in
paise + per month / total), greeting name (optional; default = first name, honorifics
skipped). Issue date = the letter's date. Duplicate rule: same recipient + offer type + role
+ start date.

## Letter content

Variable: Ref, Date, name, institution, "Dear {first name},", opening sentence with the
role in bold, role details (position, duration, mode, start date, stipend if any).
Per offer type (stored in the template, versioned): eyebrow, opening sentence, second
paragraph, three "What we expect" points, closing paragraph, sign-off. The internship
wording is the sample's; "a virtual internship" follows the mode (virtual / on-site /
hybrid).

Layout: the sample, unchanged, plus a 60 pt QR code with "Scan to verify" under Ref/Date
(top right, empty in the sample), and the signature image above the signing line.

## Engineering

1. Registry: `OFFER_LETTER` type, offer schema, public allowlist, duplicate context.
   Additive migration: `ALTER TYPE "CredentialType" ADD VALUE 'OFFER_LETTER'`.
2. Renderer (general, reusable for later letters): paragraph boxes with **bold** spans,
   top alignment, up to 8 lines; letter-spacing; DD/MM/YYYY dates; per-type copy with
   placeholders in the template config. Activation requires complete copy for both types.
3. Issue form, reissue, bulk (columns: full_name, email, offer_type, role, institution,
   start_date, duration, mode, stipend, stipend_period, greeting_name), search, dashboard,
   email wording, public page ("Offer letter", "Withdrawn").
4. `scripts/build-offer-letter-template.ts` rebuilds the sample as artwork + layout; three
   specimens (intern, ambassador, longest values) for owner review.
5. Tests: registry, renderer (bold wrapping, letter-spacing), issue → verify → withdraw,
   bulk, privacy (stipend/institution/mode never public).

## Go-live (each step owner-approved, same runbook as internships)

backup → migration → deploy → create OFR program → upload template (draft, preview) →
owner approves ambassador wording + preview → activate → smoke test.
