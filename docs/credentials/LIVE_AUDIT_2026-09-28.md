# Live website and admin audit — 2026-09-28

## Live changes and evidence

- Corrected `SUPABASE_SERVICE_ROLE_KEY` in Vercel (Production and Preview entry), using the new project's existing service-role credential. Confirmed the input was nonempty and matched the source before saving. No credentials are recorded here.
- Redeployed the existing production source with updated environment values. Deployment `dpl_CzwayJdbZ7cdKCRbUwTifBawG3ke` is READY and serves the apex and www domains.
- A synthetic POST to `https://www.medskillscatalyst.com/api/register` returned 200 with `ok: true`. The exact synthetic row was found in project `uhavtfhfebwwamltlmmq`, then removed using its id and unique test email. All 79 imported leads remain.
- Homepage, careers page and admin login page return 200. Unauthenticated invoices, careers-admin and CRM export requests return 401.
- Seven database migrations are applied. Current production has 79 leads, no staff, no credentials, no certificate templates, and no storage buckets. The other historical datasets/files have not been restored.

## Admin and code release

- The saved local admin passcode was rejected by production. No passcode was changed. An authenticated production CRM check requires the current passcode or the owner signing in through Chrome.
- `/api/leads` on the old deployed source returns 500: its shared passcode helper imports `server-only`, which crashes a Pages Router API handler. Extracted the constant-time comparator to `lib/passcode-comparison.ts`; App Router helpers retain their server-only guard.
- Type-check, 106/106 tests, and production build pass. The built local `/api/leads` now reaches its intended configuration response instead of crashing; `/verify` returns 200 locally.
- Added `.vercelignore` to exclude secret env files, local credential storage, rehearsal output, skills, and development-only files. Checked deployment inputs before upload.
- Submitted the checked working-tree release to Vercel, staged without changing the live domain. Deployment `dpl_BtrzdgsqTFRs2LmB3Wgo3jdLwsLi` is BLOCKED: Vercel cannot associate commit author `areeb@medskillscatalyst.com` with a Git account authorized for this project. The owner must correct/verify the Git identity or account linkage. No identity was spoofed and no authorization check was bypassed.
- Consequently the API fix and certificate release are not live. `/verify`, `/foundation`, and `/foundation/enroll` still return 404 on the existing deployment.

## Environment audit

Production contains `ADMIN_PASSCODE`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Razorpay keys/webhook secret, seller settings, Meta settings and GA configuration. Presence alone does not establish payment, webhook or analytics functionality; no charge or real customer email was sent.

`RESEND_API_KEY` exists with the expected key format. `CREDENTIAL_PUBLIC_BASE_URL` was read back and exactly matches `https://medskillscatalyst.com`. `CREDENTIAL_EMAIL_MODE` is a protected variable; the prior setup recorded it as `off`, and this audit did not enable live email. No local development auth/storage overrides are configured on Vercel.

Clerk production keys, `ADMIN_AUTH_MODE=clerk`, bootstrap admin allowlist and `DIRECT_URL` are absent. Passcode mode remains the default. Individual Clerk access, private credential storage and activation of the Foundation template remain required before production certificate issuance. Migration operations currently use the protected local migration environment. Preview has no `DATABASE_URL`; it is not an independently verified test environment.

## Required follow-up

1. Resolve the Vercel Git-author identity error, redeploy the checked release, verify it, then promote it to the live domain.
2. Use the actual production admin credentials to confirm sign-in and that the 79 leads appear in the CRM.
3. Complete individual staff authentication, storage/template setup, remaining historical-data restoration as needed, and production certificate smoke tests before calling the certificate system production-ready.
