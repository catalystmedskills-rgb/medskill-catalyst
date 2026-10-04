# Internship certificate v1

The live course certificate design (Foundation design v1) adapted for internship
completion, at the owner's request on 2026-10-04. Plan and design rationale:
`docs/credentials/INTERNSHIP_TEMPLATE_PLAN.md`.

What differs from the course certificate: the ribbon reads INTERNSHIP CERTIFICATE, the line
under the name reads "For successfully completing the internship", and the course's
program line holds the internship name typed for each certificate. Under it: department (if
given), the dates with the calculated duration beside them, and the issue date with total
hours (if given) beside it. Everything else (logo, frame, seal, signature, QR, ID) is
unchanged.

This folder holds only what is new: `background.pdf` and `layout.json`. The fonts and
Gagan Victor's authorized signature are shared with `../foundation-v1/` and are
**not copied** here.

## Upload

Preferred (same service calls as the admin form, draft first, then activate after checking
the preview):

```
ACTOR_EMAIL=<admin email> npx tsx --conditions=react-server scripts/upload-internship-template.ts
ACTOR_EMAIL=<admin email> npx tsx --conditions=react-server scripts/upload-internship-template.ts --activate
```

Or in **Admin → Credentials → Templates → Upload approved artwork**, on the internship
program (type Internship completion): artwork `background.pdf`; `asset1`
`../foundation-v1/CormorantGaramond-600.ttf`; `asset2` `../foundation-v1/InstrumentSans-400.ttf`;
`asset3` `../foundation-v1/InstrumentSans-600.ttf`; `asset4`
`../foundation-v1/signature-gagan-victor.png`; paste `layout.json`; tick approved
production artwork; preview; activate.

## Rebuild

`npx tsx --conditions=react-server scripts/build-internship-template.ts` (deterministic; also
writes typical, longest and minimal specimens to `output/pdf/`). Fit rule: the internship name
is one line and shrinks to 16 pt; longer names are refused at review time.
