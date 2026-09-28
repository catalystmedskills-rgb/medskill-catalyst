# Foundation certificate adaptation

Requested 2026-09-27: adapt the existing `public/certificate/foundation.html` design.

- [NEW] `scripts/build-foundation-template.ts`: reproducible, database-free builder for blank PDF artwork, upload layout, font assets, and specimen PDFs using the existing renderer.
- [NEW] `assets/credentials/foundation-v1/`: upload-ready background, font assets, layout, and instructions. Preserve the source design's logo, engraved frame, navy ribbon, seal and typography. Replace the decorative QR with the renderer's real QR.
- [NEW] `output/pdf/`: visibly labelled specimens with short and long learner names.
- [MODIFY] credential handoff documentation: record the package and remaining inputs.

Use configuration only; keep the issuance/rendering engine unchanged. Do not invent a handwritten signature. Keep production activation, deployment, program codes and real issuance pending the owner's inputs.

Validation: schema parsing, renderer preflight, QR decoding from rasterized PDFs, visual review, type-check, tests and build.

Discovered during integration: custom font upload references were nested incorrectly. Added `src/modules/credentials/template-assets.ts`, wired it into the upload action and added `tests/unit/template-assets.test.ts` to verify the actual package and rejection cases.
