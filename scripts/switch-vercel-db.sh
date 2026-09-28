#!/usr/bin/env bash
# Point the live Vercel project at the new Supabase project (uhavtfhfebwwamltlmmq).
# Reads secrets from local gitignored files and pipes them straight to the Vercel CLI;
# nothing is echoed. Does NOT deploy — changes take effect on the next deployment.
#
#   .env.migration.local   DATABASE_URL (transaction pooler, port 6543), SUPABASE_URL
#   .env.server-key.local  SUPABASE_SERVICE_ROLE_KEY=<service_role key from Supabase → Project Settings → API Keys>
set -euo pipefail
cd "$(dirname "$0")/.."
S=(--scope info-74073127 --project medskill-catalyst)

set -a; . ./.env.migration.local; . ./.env.server-key.local; set +a
for v in DATABASE_URL SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
  [ -n "${!v:-}" ] || { echo "ABORT: $v is empty"; exit 1; }
done
[[ "$SUPABASE_URL" == *uhavtfhfebwwamltlmmq* && "$DATABASE_URL" == *uhavtfhfebwwamltlmmq* ]] || { echo "ABORT: not the new project"; exit 1; }
[[ "$DATABASE_URL" == *:6543/* ]] || { echo "ABORT: DATABASE_URL must use the transaction pooler (6543)"; exit 1; }

# The key must actually be the service role for this project: listing buckets needs it.
code=$(curl -s -o /dev/null -w '%{http_code}' "$SUPABASE_URL/storage/v1/bucket" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
[ "$code" = 200 ] || { echo "ABORT: service key rejected by Supabase storage (HTTP $code)"; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' "$SUPABASE_URL/rest/v1/leads?select=id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
[ "$code" = 200 ] || { echo "ABORT: website lead path (REST /leads) failed with HTTP $code"; exit 1; }
echo "Key check: OK (service role can read storage and the leads table)"

set_var() { # name, environments...
  local name=$1; shift
  for env in "$@"; do
    vercel env rm "$name" "$env" -y "${S[@]}" >/dev/null 2>&1 || true
    printf '%s' "${!name}" | vercel env add "$name" "$env" "${S[@]}" >/dev/null
    echo "Set $name ($env)"
  done
}
set_var DATABASE_URL production
set_var SUPABASE_URL production preview
set_var SUPABASE_SERVICE_ROLE_KEY production preview

# Optional: Clerk DEVELOPMENT instance for the Preview rehearsal (AUTH_ROLLOUT.md step 4).
# .env.clerk-dev.local: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…, CLERK_SECRET_KEY=sk_test_…,
#                       BOOTSTRAP_ADMIN_EMAILS=you@example.com
# Preview scope only; Production auth is untouched (still passcode).
if [ -f .env.clerk-dev.local ]; then
  set -a; . ./.env.clerk-dev.local; set +a
  [[ "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" == pk_test_* && "${CLERK_SECRET_KEY:-}" == sk_test_* && -n "${BOOTSTRAP_ADMIN_EMAILS:-}" ]] \
    || { echo "ABORT: .env.clerk-dev.local needs pk_test_/sk_test_ keys and BOOTSTRAP_ADMIN_EMAILS"; exit 1; }
  NEXT_PUBLIC_CLERK_SIGN_IN_URL=/staff-sign-in
  ADMIN_AUTH_MODE=clerk
  for v in NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY CLERK_SECRET_KEY BOOTSTRAP_ADMIN_EMAILS NEXT_PUBLIC_CLERK_SIGN_IN_URL ADMIN_AUTH_MODE; do
    set_var "$v" preview
  done
else
  echo "Skipped Clerk (no .env.clerk-dev.local)."
fi

echo "Done. Nothing deployed."
vercel env ls "${S[@]}" 2>/dev/null | grep -E "DATABASE_URL|SUPABASE_|CLERK|BOOTSTRAP|ADMIN_AUTH_MODE"
