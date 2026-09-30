/**
 * Apply migration 380 — Infobip as second SMS provider (local DATABASE_URL only).
 * Run: node scripts/apply-380-sms-infobip-provider.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";
import { isProductionDatabaseUrl } from "./lib/env-mode.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
const databaseUrl = env.DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl?.trim()) throw new Error("DATABASE_URL missing");
if (isProductionDatabaseUrl(databaseUrl)) {
  throw new Error("Refusing to apply migration 380 against a production DATABASE_URL.");
}

const migrationName = "380_sms_infobip_provider.sql";
const version = "380";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const c = new pg.Client({ connectionString: databaseUrl });
await c.connect();

const report = {
  migration: migrationName,
  applied: false,
  alreadyApplied: false,
  columns: null,
  providerCheck: null,
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
      `insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)`,
      [version, migrationName.replace(/\.sql$/, "")],
    );
    report.applied = true;
  }

  const cols = await c.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company_sms_settings'
      and column_name in ('api_key_encrypted', 'api_key_hint', 'base_url', 'provider')
    order by 1
  `);
  report.columns = cols.rows.map((r) => r.column_name);

  const check = await c.query(`
    select pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'company_sms_settings'
      and c.conname = 'company_sms_settings_provider_check'
  `);
  report.providerCheck = check.rows[0]?.def ?? null;

  await c.query("commit");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await c.query("rollback");
  throw error;
} finally {
  await c.end();
}
