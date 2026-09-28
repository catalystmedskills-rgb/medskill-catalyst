import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

/**
 * Rebuild the test database from the real migration files, in order.
 * SAFETY: refuses to touch any database whose name does not end in "_test".
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5433/msc_test?host=/tmp";
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) throw new Error(`Refusing to reset non-test database "${dbName}"`);
  const psql = (args: string[]) => execFileSync("psql", ["-q", "-v", "ON_ERROR_STOP=1", url, ...args], { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" } });
  psql(["-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"]);
  // Hosted Supabase supplies these roles; Prisma deploy supplies its ledger.
  // The local test harness applies SQL directly, so provide those prerequisites.
  psql(["-c", `DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  CREATE TABLE public._prisma_migrations (id varchar(36) PRIMARY KEY);`]);
  const dir = path.resolve(__dirname, "../prisma/migrations");
  for (const m of readdirSync(dir).filter((d) => !d.endsWith(".toml")).sort()) {
    psql(["-f", path.join(dir, m, "migration.sql")]);
  }
  // Apply the credential migration twice: it must be idempotent.
  psql(["-f", path.join(dir, "20260925120000_credentials", "migration.sql")]);
}
