/**
 * Apply migration 428 on LOCAL Postgres only (127.0.0.1:54322).
 * Does not touch production.
 *
 * Run: node scripts/apply-428-scheduling-service-kind-demo-local.mjs
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
  throw new Error("Refusing to apply migration 428 against a production DATABASE_URL.");
}

const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing non-local host: ${parsed.hostname}`);
}
if (parsed.port !== "54322") {
  throw new Error(`Refusing non-local Postgres port: ${parsed.port || "(default)"}`);
}

const migrationName = "428_scheduling_service_kind_demo.sql";
const version = "428";
const predecessor = "427";
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
    // Idempotent re-apply of additive DDL
    await c.query(sql);
    console.log(JSON.stringify({ ok: true, applied: false, alreadyPresent: true, version }));
  }

  const check = await c.query(`
    select
      (select count(*) from information_schema.columns
         where table_schema='public' and table_name='scheduling_services' and column_name='service_kind') as has_kind,
      (select count(*) from information_schema.columns
         where table_schema='public' and table_name='scheduling_bookings' and column_name='client_request_id') as has_client_req,
      (select count(*) from public.scheduling_services where service_kind = 'operational' and deleted_at is null) as operational_count
  `);
  console.log(JSON.stringify({ verify: check.rows[0] }, null, 2));
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
