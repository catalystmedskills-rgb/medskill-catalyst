# Admin authentication: Clerk cutover plan (APPROVAL GATE)

Status: **built and tested; not switched on.** Production still runs the shared
passcode (`ADMIN_AUTH_MODE` unset = `passcode`). Nothing changes until you
approve and set `ADMIN_AUTH_MODE=clerk`.

## 1. Flow in Clerk mode

1. A staff member opens `/admin`. `src/middleware.ts` runs Clerk. If they're signed out, it
   redirects them to `/staff-sign-in` (admin APIs return 401 instead).
2. They sign in with Clerk (email code or Google, whichever you enable in the Clerk dashboard).
3. Every admin page, action and API calls `requireStaff()` / `requirePermission()`
   (`src/lib/auth.ts`). These map the Clerk user to a `staff_users` row and check the
   role on the server. The middleware is only an outer layer and is never the only check.
4. If someone signs in without an active staff row, they see "not authorized". Signing up
   with Clerk grants nothing.

## 2. How Clerk identities map to `staff_users`

| Situation | What happens |
|---|---|
| Row with `clerk_user_id = <Clerk id>` exists | That row is used. |
| An admin added the person on **Admin → Staff** (row stored as `pending:<email>`) | On their first sign-in, if one of their **verified** Clerk emails matches, the row is bound to their Clerk id. This happens once and is permanent. |
| Verified email is listed in `BOOTSTRAP_ADMIN_EMAILS` and no row uses it | An ADMIN row is created. This is how the first admin gets in. |
| Anything else | 403. |

Unverified emails are never used for matching. Once a row is bound, a second Clerk
account with the same email can't take it over. Both behaviours are covered by tests.

The existing shared row (`clerk_user_id = passcode-admin`) is left untouched, so its
history and audit links keep working. In Clerk mode it can't sign in.

## 3. Roles (centralized in `src/lib/permissions.ts`)

| Permission | VIEWER | COUNSELOR | ISSUER / ACCOUNTS | ADMIN |
|---|---|---|---|---|
| Search/view credentials (public-equivalent fields) | ✓ | ✓ | ✓ | ✓ |
| See learner email/deliveries, learner directory | | | ✓ | ✓ |
| Issue, bulk issue, resend | | | ✓ | ✓ |
| Revoke, reissue | | | | ✓ |
| Programs, cohorts, templates, settings, staff | | | | ✓ |
| Full audit (internal reasons, errors) | | | | ✓ |

Credential **writes** also need an individual login. The shared passcode can browse
credentials but can't issue, revoke, reissue or change templates. Existing CRM pages
(leads, careers) keep their old rank rules, and the new ISSUER role gets no CRM rights.

## 4. Rollout steps

1. **Clerk dashboard (production instance):** create the application and enable the
   sign-in methods. **Turn off public sign-ups** (restricted mode). Access still depends on a staff row.
2. **Vercel env (Production):** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
   `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/staff-sign-in`,
   `BOOTSTRAP_ADMIN_EMAILS=<your email>[,<Gagan's email>]`. Keep `ADMIN_AUTH_MODE` unset for now.
3. Apply the credential migration (see DEPLOYMENT_CHECKLIST.md) and deploy. Behaviour is
   still passcode-only.
4. **Rehearse on a Preview deployment** with `ADMIN_AUTH_MODE=clerk` (Preview scope only)
   and Clerk's development keys. Sign in as the bootstrap admin, add one issuer on
   Admin → Staff, and have them sign in.
5. **Cutover:** set `ADMIN_AUTH_MODE=clerk` on Production and redeploy. The bootstrap
   admin signs in first and adds the rest of the staff.
6. After a week without issues, remove `BOOTSTRAP_ADMIN_EMAILS`. Rotate `ADMIN_PASSCODE` as well; it is retained only for passcode-mode rollback.

## 5. How we avoid locking ourselves out

- **Instant rollback:** unset `ADMIN_AUTH_MODE` and redeploy. The passcode login comes
  back and no data changes.
- **Bootstrap emails** let a named person become admin without anyone else signing in first.
- **Last-admin guard:** no action can demote or deactivate the last active, signed-in
  admin. Changes are serialized with a database advisory lock, so two admins can't demote
  each other at the same moment.
- **Break-glass script** (needs database access):
  `npx tsx --conditions=react-server scripts/staff-grant-admin.ts you@medskillscatalyst.com "Your Name"`.
  Every use is written to `audit_logs`.

## 6. Not changed in this work (decide separately)

- Updated 2026-09-27: `/api/careers/admin` and `/api/invoices*` now use `requireStaff()` in Clerk mode, require COUNSELOR/ACCOUNTS respectively, and reject shared passcodes. Cookie-authenticated writes require same-origin JSON. The old `/api/leads` feed returns 410 in Clerk mode; use `/admin/leads` and its authenticated export. Legacy passcode behavior remains only in passcode mode for rollback. Rehearse the legacy invoice UI with Clerk before cutover.
- The existing leads/careers pages let VIEWER see lead PII (the old rank model). Worth
  reviewing once staff have real roles.
