/**
 * Apply / reconcile migration 423 on LOCAL Postgres only (127.0.0.1:54322).
 *
 * DDL is fully idempotent (`CREATE UNIQUE INDEX IF NOT EXISTS` + comments).
 * If the indexes already exist (e.g. from the CRM PG suite before() hook) but
 * schema_migrations has no row for 423, this script verifies the definitions
 * then records history — it does not fabricate a record without that check.
 *
 * Run: node scripts/apply-423-crm-concurrency-uniqueness-local.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";
import { isProductionDatabaseUrl } from "./lib/env-mode.mjs";

const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const EXPECTED_INDEXES = [
  "leads_one_open_per_conversation_idx",
  "opportunities_one_open_product_interest_per_lead_idx",
  "opportunity_line_items_one_product_per_opp_idx",
];

const root = resolveProjectRoot(import.meta.url);
process.env.VALUEOR_ENV = "local";
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
const databaseUrl = (env.DATABASE_URL || process.env.DATABASE_URL || "").trim() || LOCAL_DB;

if (isProductionDatabaseUrl(databaseUrl)) {
  throw new Error("Refusing to apply migration 423 against a production DATABASE_URL.");
}

const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing non-local host: ${parsed.hostname}`);
}
if (parsed.port !== "54322") {
  throw new Error(`Refusing non-local Postgres port: ${parsed.port || "(default)"}`);
}

const migrationName = "423_crm_concurrency_uniqueness.sql";
const version = "423";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const c = new pg.Client({ connectionString: databaseUrl });
await c.connect();

const report = {
  migration: migrationName,
  database: `${parsed.hostname}:${parsed.port}/${parsed.pathname.replace(/^\//, "")}`,
  applied: false,
  alreadyRecorded: false,
  indexesBefore: null,
  indexesAfter: null,
  historyRecorded: false,
};

async function loadIndexes(client) {
  const { rows } = await client.query(
    `select i.relname as index_name,
            pg_get_indexdef(i.oid) as index_def,
            ix.indisunique as is_unique
       from pg_class t
       join pg_index ix on ix.indrelid = t.oid
       join pg_class i on i.oid = ix.indexrelid
       join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and i.relname = any($1::text[])
      order by i.relname`,
    [EXPECTED_INDEXES],
  );
  return rows;
}

function assertIndexesComplete(rows, label) {
  const names = new Set(rows.map((r) => r.index_name));
  const missing = EXPECTED_INDEXES.filter((n) => !names.has(n));
  if (missing.length) {
    throw new Error(`${label}: missing indexes: ${missing.join(", ")}`);
  }
  for (const row of rows) {
    if (!row.is_unique) throw new Error(`${label}: ${row.index_name} is not UNIQUE`);
  }
  const lead = rows.find((r) => r.index_name === "leads_one_open_per_conversation_idx");
  if (!/company_id.*conversation_id/s.test(lead.index_def) || !/converted/.test(lead.index_def)) {
    throw new Error(`${label}: leads index predicate/def mismatch`);
  }
  const opp = rows.find((r) => r.index_name === "opportunities_one_open_product_interest_per_lead_idx");
  if (!/product_interest_after_qualify/.test(opp.index_def) || !/won_at IS NULL/.test(opp.index_def)) {
    throw new Error(`${label}: opportunities index predicate/def mismatch`);
  }
  const line = rows.find((r) => r.index_name === "opportunity_line_items_one_product_per_opp_idx");
  if (!/opportunity_id.*product_id/s.test(line.index_def) || !/deleted_at IS NULL/.test(line.index_def)) {
    throw new Error(`${label}: line_items index predicate/def mismatch`);
  }
}

try {
  report.indexesBefore = await loadIndexes(c);

  await c.query("begin");
  const existing = await c.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );

  if (existing.rows.length > 0) {
    report.alreadyRecorded = true;
    // Still ensure DDL is present (idempotent).
    await c.query(sql);
  } else {
    // Idempotent DDL — no-op if the CRM suite already created the indexes.
    await c.query(sql);
    const afterDdl = await loadIndexes(c);
    assertIndexesComplete(afterDdl, "post-ddl verification");
    await c.query(
      `insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)
       on conflict (version) do nothing`,
      [version, migrationName.replace(/\.sql$/, "")],
    );
    report.applied = true;
    report.historyRecorded = true;
  }
  await c.query("commit");

  report.indexesAfter = await loadIndexes(c);
  assertIndexesComplete(report.indexesAfter, "final verification");

  const hist = await c.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  report.historyRow = hist.rows[0] ?? null;
  if (!report.historyRow) {
    throw new Error("schema_migrations still missing version 423 after apply");
  }
  report.historyRecorded = true;

  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await c.query("rollback").catch(() => {});
  throw error;
} finally {
  await c.end();
}
