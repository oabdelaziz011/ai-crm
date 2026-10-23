/**
 * Apply migration 429 on LOCAL Postgres only (127.0.0.1:54322).
 * Does not touch production.
 *
 * Run: node scripts/apply-429-ai-employee-sales-demo-scheduling-tools-local.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";
import { isProductionDatabaseUrl } from "./lib/env-mode.mjs";

const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const root = resolveProjectRoot(import.meta.url);
process.env.VALUEOR_ENV = "local";
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
const databaseUrl = (env.DATABASE_URL || process.env.DATABASE_URL || "").trim() || LOCAL_DB;

if (isProductionDatabaseUrl(databaseUrl)) {
  throw new Error("Refusing to apply migration 429 against a production DATABASE_URL.");
}

const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing non-local host: ${parsed.hostname}`);
}
if (parsed.port !== "54322") {
  throw new Error(`Refusing non-local Postgres port: ${parsed.port || "(default)"}`);
}

const migrationName = "429_ai_employee_sales_demo_scheduling_tools.sql";
const version = "429";
const predecessor = "428";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const c = new pg.Client({ connectionString: databaseUrl });
await c.connect();

try {
  const pred = await c.query(`select version from supabase_migrations.schema_migrations where version = $1`, [
    predecessor,
  ]);
  if (pred.rowCount === 0) {
    console.warn(`Warning: predecessor migration ${predecessor} not recorded; continuing on local.`);
  }

  const existing = await c.query(`select version from supabase_migrations.schema_migrations where version = $1`, [
    version,
  ]);
  if (existing.rowCount === 0) {
    await c.query("begin");
    await c.query(sql);
    await c.query(`insert into supabase_migrations.schema_migrations(version) values ($1)`, [version]);
    await c.query("commit");
    console.log(JSON.stringify({ ok: true, applied: true, version }));
  } else {
    await c.query(sql);
    console.log(JSON.stringify({ ok: true, applied: false, alreadyPresent: true, version }));
  }

  const check = await c.query(`
    select key, is_enabled
    from public.tool_definitions
    where key in ('list_demo_types','search_demo_availability','find_next_demo','create_demo_booking','create_booking')
    order by key
  `);
  console.log(JSON.stringify({ tools: check.rows }, null, 2));
} catch (error) {
  try {
    await c.query("rollback");
  } catch {
    /* ignore */
  }
  throw error;
} finally {
  await c.end();
}
