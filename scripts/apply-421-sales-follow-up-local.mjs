/**
 * Apply migration 421 to LOCAL Postgres only (127.0.0.1:54322).
 * Run: node scripts/apply-421-sales-follow-up-local.mjs
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
  throw new Error("Refusing to apply migration 421 against a production DATABASE_URL.");
}

const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing non-local host: ${parsed.hostname}`);
}
if (parsed.port !== "54322") {
  throw new Error(`Refusing non-local Postgres port: ${parsed.port || "(default)"}`);
}

const migrationName = "421_sales_follow_up.sql";
const version = "421";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const c = new pg.Client({ connectionString: databaseUrl });
await c.connect();

const report = {
  migration: migrationName,
  database: `${parsed.hostname}:${parsed.port}/${parsed.pathname.replace(/^\//, "")}`,
  applied: false,
  alreadyApplied: false,
  tables: null,
};

try {
  await c.query("begin");
  const existing = await c.query(
    `select version from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  if (existing.rows.length > 0) {
    report.alreadyApplied = true;
  } else {
    await c.query(sql);
    await c.query(
      `insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)
       on conflict (version) do nothing`,
      [version, migrationName.replace(/\.sql$/, "")],
    );
    report.applied = true;
  }
  await c.query("commit");

  const tables = await c.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'sales_follow_up_settings',
        'sales_follow_up_attempts',
        'sales_follow_up_jobs'
      )
    order by table_name
  `);
  report.tables = tables.rows.map((row) => row.table_name);

  const cols = await c.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'sales_follow_up_jobs'
    order by ordinal_position
  `);
  report.jobColumns = cols.rows.map((row) => row.column_name);

  const fn = await c.query(`
    select 1 as ok
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'claim_sales_follow_up_jobs'
  `);
  report.claimFunction = fn.rows.length > 0;
} catch (error) {
  await c.query("rollback").catch(() => {});
  throw error;
} finally {
  await c.end();
}

console.log(JSON.stringify(report, null, 2));
if (!report.tables || report.tables.length < 3 || !report.claimFunction) {
  process.exitCode = 1;
}
