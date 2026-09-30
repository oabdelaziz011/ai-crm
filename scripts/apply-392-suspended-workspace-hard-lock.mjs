/**
 * Apply migration 392 — Suspended workspace hard lock.
 * Run: node scripts/apply-392-suspended-workspace-hard-lock.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: false });
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const sql = readFileSync(
  resolve(root, "supabase/migrations/392_suspended_workspace_hard_lock.sql"),
  "utf8",
);

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: false });
await client.connect();
try {
  await client.query("begin");
  await client.query(sql);
  await client.query(
    `insert into supabase_migrations.schema_migrations(version, name, statements)
     values ($1, $2, array[]::text[])
     on conflict (version) do nothing`,
    ["392", "392_suspended_workspace_hard_lock"],
  );
  await client.query("commit");
  const check = await client.query(
    `select public.company_workspace_unlocked('d0000010-0001-4001-8001-000000000001'::uuid) as unlocked`,
  );
  console.log("OK applied 392", check.rows[0]);
} catch (err) {
  await client.query("rollback");
  console.error("FAIL", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
