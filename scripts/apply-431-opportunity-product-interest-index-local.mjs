/**
 * Apply migration 431 on LOCAL Postgres only (127.0.0.1:54322).
 * Replaces legacy per-lead product-interest uniqueness with per-lead+product.
 *
 * Run: node scripts/apply-431-opportunity-product-interest-index-local.mjs
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
  throw new Error("Refusing to apply migration 431 against a production DATABASE_URL.");
}

const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing non-local host: ${parsed.hostname}`);
}
if (parsed.port !== "54322") {
  throw new Error(`Refusing non-local Postgres port: ${parsed.port || "(default)"}`);
}

const migrationName = "431_opportunity_product_interest_per_lead_product.sql";
const version = "431";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const c = new pg.Client({ connectionString: databaseUrl });
await c.connect();

try {
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
      exists(
        select 1 from pg_indexes
        where schemaname = 'public' and indexname = 'opportunities_one_open_product_interest_per_lead_idx'
      ) as legacy_index_present,
      exists(
        select 1 from pg_indexes
        where schemaname = 'public' and indexname = 'opportunities_one_open_product_interest_per_lead_product_idx'
      ) as product_scoped_index_present,
      exists(
        select 1 from pg_indexes
        where schemaname = 'public' and indexname = 'opportunities_one_open_per_customer_product_idx'
      ) as customer_product_index_present
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
