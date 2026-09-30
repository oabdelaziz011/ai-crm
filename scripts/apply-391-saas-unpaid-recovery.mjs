/**
 * Apply migration 391 — SaaS unpaid recovery while Suspended.
 * Run: node scripts/apply-391-saas-unpaid-recovery.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: false });
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const sqlPath = resolve(root, "supabase/migrations/391_saas_unpaid_recovery_while_suspended.sql");
const sql = readFileSync(sqlPath, "utf8");

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: false,
});
await client.connect();

try {
  await client.query("begin");
  await client.query(sql);
  await client.query(
    `insert into supabase_migrations.schema_migrations(version, name, statements)
     values ($1, $2, array[]::text[])
     on conflict (version) do nothing`,
    ["391", "391_saas_unpaid_recovery_while_suspended"],
  );
  await client.query("commit");
  const check = await client.query(
    `select public.saas_subscription_is_unpaid_recovery('expired') as expired,
            public.saas_subscription_is_unpaid_recovery('active') as active`,
  );
  console.log("OK applied 391", check.rows[0]);
} catch (err) {
  await client.query("rollback");
  console.error("FAIL", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
