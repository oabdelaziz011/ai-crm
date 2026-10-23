/**
 * Apply migration 430 on LOCAL Postgres only (127.0.0.1:54322).
 * Does not touch production. Never auto-closes/merges opportunities.
 *
 * Run: node scripts/apply-430-opportunity-lifecycle-local.mjs
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
  throw new Error("Refusing to apply migration 430 against a production DATABASE_URL.");
}

const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing non-local host: ${parsed.hostname}`);
}
if (parsed.port !== "54322") {
  throw new Error(`Refusing non-local Postgres port: ${parsed.port || "(default)"}`);
}

const migrationName = "430_opportunity_lifecycle_demo_completed_primary_product.sql";
const version = "430";
const predecessor = "429";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const c = new pg.Client({ connectionString: databaseUrl });
await c.connect();

try {
  const pred = await c.query(
    `select version from supabase_migrations.schema_migrations where version = $1`,
    [predecessor],
  );
  if (pred.rowCount === 0) {
    console.warn(`Warning: predecessor migration ${predecessor} not recorded; continuing on local.`);
  }

  const existing = await c.query(
    `select version from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  if (existing.rowCount === 0) {
    await c.query("begin");
    await c.query(sql);
    await c.query(`insert into supabase_migrations.schema_migrations(version) values ($1)`, [
      version,
    ]);
    await c.query("commit");
    console.log(JSON.stringify({ ok: true, applied: true, version }));
  } else {
    await c.query(sql);
    console.log(JSON.stringify({ ok: true, applied: false, alreadyPresent: true, version }));
  }

  const checks = await c.query(`
    select
      (select count(*)::int from public.lead_stages where lifecycle_status = 'demo_completed' and deleted_at is null) as demo_completed_stages,
      exists(
        select 1 from pg_indexes
        where schemaname = 'public' and indexname = 'opportunities_one_open_per_customer_product_idx'
      ) as uniqueness_index,
      exists(
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'opportunities' and column_name = 'primary_product_id'
      ) as primary_product_col
  `);
  console.log(JSON.stringify({ verify: checks.rows[0] }, null, 2));
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
