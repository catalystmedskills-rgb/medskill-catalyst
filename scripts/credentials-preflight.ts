/** Read-only production readiness inspection. Never migrates, uploads or sends email. */
import { config } from "dotenv";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const envIndex = process.argv.indexOf("--env");
if (envIndex !== -1) {
  const filename = process.argv[envIndex + 1];
  if (!filename || config({ path: filename, quiet: true }).error) {
    console.error("Cannot read the specified environment file."); process.exit(1);
  }
}
const checks: { name: string; status: "PASS" | "BLOCKED"; detail: string }[] = [];
const check = (name: string, ok: boolean, detail: string) => checks.push({ name, status: ok ? "PASS" : "BLOCKED", detail });
const present = (key: string) => Boolean(process.env[key]?.trim());
async function main() {
  for (const key of ["DATABASE_URL", "DIRECT_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "CREDENTIAL_PUBLIC_BASE_URL"]) {
    check(key, present(key), present(key) ? "Configured (value hidden)" : "Missing");
  }
  check("Individual production authentication", process.env.ADMIN_AUTH_MODE === "clerk", "ADMIN_AUTH_MODE must be clerk for issuance");
  check("No local development overrides", !process.env.DEV_AUTH_ENABLE && process.env.CREDENTIAL_STORAGE !== "local" && process.env.ADMIN_AUTH_MODE !== "dev", "Local impersonation/storage must be disabled");
  check("Production Clerk keys", Boolean(process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")), "Use production-instance keys at launch");
  const mode = process.env.CREDENTIAL_EMAIL_MODE || "off";
  check("Email configuration", ["off", "live", "redirect"].includes(mode) && (mode === "off" || present("RESEND_API_KEY")) && (mode !== "redirect" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(process.env.CREDENTIAL_EMAIL_REDIRECT_TO || "")), `Mode: ${["off", "live", "redirect"].includes(mode) ? mode : "invalid"}; live delivery requires separate owner approval`);
  try {
    const url = new URL(process.env.CREDENTIAL_PUBLIC_BASE_URL || "");
    check("Canonical HTTPS origin", url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/" && !["localhost", "127.0.0.1"].includes(url.hostname), "QR origin must be public HTTPS with no path");
  } catch { check("Canonical HTTPS origin", false, "Missing or invalid"); }

  if (present("DATABASE_URL")) {
    const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000, statement_timeout: 10000 });
    try {
      await client.connect();
      await client.query("BEGIN READ ONLY");
      const tables = ["credentials", "credential_events", "certificate_templates", "credential_bulk_jobs", "credential_bulk_rows", "credential_email_deliveries"];
      const rls = await client.query("SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1)", [tables]);
      check("Credential schema and RLS", tables.every((name) => rls.rows.some((row) => row.relname === name && row.relrowsecurity)), "All six credential tables must exist with RLS enabled");
      const migrations = await client.query("SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations");
      const folder = path.resolve("prisma/migrations");
      for (const item of await readdir(folder, { withFileTypes: true })) {
        if (!item.isDirectory()) continue;
        const checksum = createHash("sha256").update(await readFile(path.join(folder, item.name, "migration.sql"))).digest("hex");
        check(`Migration ${item.name}`, migrations.rows.some((row) => row.migration_name === item.name && row.finished_at && !row.rolled_back_at && row.checksum === checksum), "Applied migration checksum must match this release");
      }
      const required = ["credential_events_no_update_delete", "credential_events_no_truncate", "credentials_guard", "certificate_templates_guard"];
      const triggers = await client.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O', 'A') AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)");
      check("Lifecycle guards", required.every((name) => triggers.rows.some((row) => row.tgname === name)), "All four lifecycle triggers must be enabled");
      const readiness = await client.query("SELECT c.slug, c.code, EXISTS (SELECT 1 FROM certificate_templates t WHERE t.course_id=c.id AND t.status='ACTIVE' AND t.is_production) AS ready FROM courses c WHERE c.slug = 'foundation-program'");
      check("Foundation program and artwork", readiness.rows.length === 1 && Boolean(readiness.rows[0].code) && readiness.rows[0].ready, "Foundation needs an owner-approved code and active production template");
      const admins = await client.query("SELECT count(*)::int AS count FROM staff_users WHERE role='ADMIN' AND is_active AND clerk_user_id NOT LIKE 'pending:%' AND clerk_user_id NOT LIKE 'dev:%' AND clerk_user_id <> 'passcode-admin'");
      check("Individual admin access", admins.rows[0].count > 0 || present("BOOTSTRAP_ADMIN_EMAILS"), "An individual admin or bootstrap allowlist must exist");
      await client.query("ROLLBACK");
    } catch {
      check("Database inspection", false, "Connection or schema inspection failed; verify project availability and migration status (credentials hidden)");
    } finally { await client.end().catch(() => undefined); }
  }
  if (present("SUPABASE_URL") && present("SUPABASE_SERVICE_ROLE_KEY")) {
    try {
      const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
      });
      const { data, error } = await supabase.storage.getBucket("credentials");
      check("Private credential bucket", !error && data?.public === false, "Bucket must exist and be private; this check never creates it");
    } catch { check("Private credential bucket", false, "Storage inspection unavailable"); }
  }
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), readOnly: true, automatedChecksPass: checks.every((c) => c.status === "PASS"), checks, manualGates: ["Backup/restore evidence", "Clerk sign-in rehearsal", "Owner-approved artwork and program codes (Gagan signature authorization confirmed)", "Firewall rate limiting", "Sending-domain verification before live email", "Production smoke test and rollback deployment"] }, null, 2));
  if (checks.some((c) => c.status === "BLOCKED")) process.exitCode = 1;
}
main().catch(() => { console.error("Preflight failed; no changes were made."); process.exitCode = 1; });
