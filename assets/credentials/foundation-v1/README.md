# Foundation certificate v1

Adapted from `public/certificate/foundation.html` at the owner's request on 2026-09-27. This is an upload-ready design package, not an activated production template.

## Upload

In **Admin → Credentials → Templates → Upload approved artwork as a new version**:

1. Select the Foundation program and name the version `Foundation design v1`.
2. Artwork: `background.pdf`.
3. `asset1`: `CormorantGaramond-600.ttf`.
4. `asset2`: `InstrumentSans-400.ttf`.
5. `asset3`: `InstrumentSans-600.ttf`.
6. `asset4`: `signature-gagan-victor.png` (Gagan Victor's approved signature).
7. Paste `layout.json` into Layout. Save as draft and preview before activation.

The PDF retains the source logo, watermark, engraved frame, navy ribbon and seal. Learner name, program name, completion/issue/expiry dates, certificate ID and verification URL are dynamic. The renderer generates the QR, including its quiet zone. The page is 842.25 × 595.5 PDF points, matching the original 1123 × 794 design.

The serif font was converted from the original bundled Cormorant Garamond Latin WOFF2 to static weight 600 TTF. Instrument Sans uses existing repository TTFs. These fonts are not a promise of support for all scripts; review names outside their character coverage before issuance.

## Signature and launch inputs

The owner confirmed on 2026-09-27 that the supplied signature is Gagan Victor's and that Gagan approved its use. `signature-gagan-victor.png` is the cropped, transparent asset, placed above the printed name with its original proportions preserved. `layout.json` requires it in `asset4`; do not omit that upload slot. The small source image limits print sharpness; replace it only with an authentic higher-resolution scan and create a new template version after activation.

Real program codes, final production artwork approval and the existing deployment/authentication gates remain with the owner. Signature authorization is confirmed. No database rows, storage objects, live settings or learner emails were changed by the builder.

## Rebuild and review

Run `npx tsx scripts/build-foundation-template.ts` from the repository root. It uses the committed TTF and original bundled logo, requires no database, and writes this package plus two labelled specimen PDFs to `output/pdf/`. Preview IDs and tokens are deliberately non-issued sample values.

Validation covers schema parsing through the same upload resolver, short/long-name PDF rendering and visual inspection, and QR decoding at 150 dpi. Keep all three fonts and the signature PNG with the layout; the upload resolver uses the uploaded files' actual hashes.
