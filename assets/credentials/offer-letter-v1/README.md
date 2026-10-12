# Offer letter v1

The owner's sample (`MedSkills Offer Letter Template.pdf`, 2026-10-12) rebuilt as a template
for the OFFER_LETTER program (MedSkills Offer Letters, code OFR). Plan:
`docs/credentials/OFFER_LETTER_PLAN.md`.

- `background.pdf`: the fixed artwork (letterhead, "Offer letter." heading, cards, labels,
  signatory "Gagan Victor, Founder, MedSkills Catalyst", seal, footer).
- `layout.json`: every variable field, plus the wording for each offer type in `copy`
  (INTERNSHIP = the sample word for word; CAMPUS_AMBASSADOR = a draft for owner approval).
  Changing wording means a new template version.

Additions to the sample: a "Scan to verify" QR under Ref/Date, and a fifth Role details row
(stipend, printed only when given), so the card is 20 pt taller.

Not copied here: the fonts (`assets/fonts/InstrumentSans-400.ttf` → asset1,
`InstrumentSans-600.ttf` → asset2) and Gagan Victor's signature
(`../foundation-v1/signature-gagan-victor.png` → asset4).

Upload: `scripts/upload-offer-letter-template.ts` (draft + preview; `--activate` after review).
Rebuild: `npx tsx --conditions=react-server scripts/build-offer-letter-template.ts`.
