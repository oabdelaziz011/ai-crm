/**
 * Apply / reconcile migration 422 on LOCAL Postgres only (127.0.0.1:54322).
 *
 * Per prior audit: DDL is already present on the shared local DB but
 * schema_migrations lacked version 422. This script:
 *   1) refuses any non-local target
 *   2) verifies column + comment + GIN index match the migration file
 *   3) if anything is missing/mismatched: stops WITHOUT recording history
 *   4) if complete: runs idempotent DDL (IF NOT EXISTS) and records history
 *
 * Run: node scripts/apply-422-catalog-product-aliases-local.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";
import { isProductionDatabaseUrl } from "./lib/env-mode.mjs";

const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const EXPECTED_COMMENT =
  "Optional customer-facing synonyms and trade names used by AI catalog search when VALUEOR_PRODUCT_ALIAS_SEARCH is enabled. Never includes cost/margin.";

const root = resolveProjectRoot(import.meta.url);
process.env.VALUEOR_ENV = "local";
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
const databaseUrl = (env.DATABASE_URL || process.env.DATABASE_URL || "").trim() || LOCAL_DB;

if (isProductionDatabaseUrl(databaseUrl)) {
  throw new Error("Refusing to apply migration 422 against a production DATABASE_URL.");
}

const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing non-local host: ${parsed.hostname}`);
}
if (parsed.port !== "54322") {
  throw new Error(`Refusing non-local Postgres port: ${parsed.port || "(default)"}`);
}

const migrationName = "422_catalog_product_aliases.sql";
const version = "422";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const c = new pg.Client({ connectionString: databaseUrl });
await c.connect();

const report = {
  migration: migrationName,
  database: `${parsed.hostname}:${parsed.port}/${parsed.pathname.replace(/^\//, "")}`,
  applied: false,
  alreadyRecorded: false,
  historyRecorded: false,
  schemaBefore: null,
  schemaAfter: null,
  mismatches: [],
};

async function loadSchema(client) {
  const col = await client.query(
    `select column_name, data_type, udt_name, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'catalog_products'
        and column_name = 'aliases'`,
  );
  const comment = await client.query(
    `select col_description('public.catalog_products'::regclass, a.attnum) as comment
       from pg_attribute a
      where a.attrelid = 'public.catalog_products'::regclass
        and a.attname = 'aliases'
        and not a.attisdropped`,
  );
  const index = await client.query(
    `select i.relname as index_name,
            pg_get_indexdef(i.oid) as index_def,
            ix.indisunique as is_unique
       from pg_class t
       join pg_index ix on ix.indrelid = t.oid
       join pg_class i on i.oid = ix.indexrelid
       join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'catalog_products'
        and i.relname = 'idx_catalog_products_aliases_gin'`,
  );
  return {
    column: col.rows[0] ?? null,
    comment: comment.rows[0]?.comment ?? null,
    index: index.rows[0] ?? null,
  };
}

function collectMismatches(schema) {
  const mismatches = [];
  const col = schema.column;
  if (!col) {
    mismatches.push({ field: "column.aliases", expected: "exists", actual: "missing" });
  } else {
    if (col.udt_name !== "_text" && col.data_type !== "ARRAY") {
      mismatches.push({
        field: "column.aliases.type",
        expected: "text[] / _text",
        actual: { data_type: col.data_type, udt_name: col.udt_name },
      });
    }
    if (col.is_nullable !== "NO") {
      mismatches.push({
        field: "column.aliases.is_nullable",
        expected: "NO",
        actual: col.is_nullable,
      });
    }
    const def = String(col.column_default || "");
    if (!def.includes("{}") || !/text\[\]/.test(def)) {
      mismatches.push({
        field: "column.aliases.default",
        expected: "'{}'::text[]",
        actual: col.column_default,
      });
    }
  }

  if (schema.comment !== EXPECTED_COMMENT) {
    mismatches.push({
      field: "column.aliases.comment",
      expected: EXPECTED_COMMENT,
      actual: schema.comment,
    });
  }

  const idx = schema.index;
  if (!idx) {
    mismatches.push({
      field: "index.idx_catalog_products_aliases_gin",
      expected: "exists",
      actual: "missing",
    });
  } else {
    if (idx.is_unique) {
      mismatches.push({
        field: "index.unique",
        expected: false,
        actual: true,
      });
    }
    if (!/USING gin/i.test(idx.index_def)) {
      mismatches.push({
        field: "index.access_method",
        expected: "GIN",
        actual: idx.index_def,
      });
    }
    if (!/\(aliases\)/i.test(idx.index_def)) {
      mismatches.push({
        field: "index.columns",
        expected: "(aliases)",
        actual: idx.index_def,
      });
    }
    if (!/deleted_at IS NULL/i.test(idx.index_def)) {
      mismatches.push({
        field: "index.predicate",
        expected: "WHERE (deleted_at IS NULL)",
        actual: idx.index_def,
      });
    }
  }
  return mismatches;
}

try {
  report.schemaBefore = await loadSchema(c);
  report.mismatches = collectMismatches(report.schemaBefore);

  if (report.mismatches.length > 0) {
    report.stopped = true;
    report.reason =
      "Schema does not fully match migration 422 — refusing to record history. No speculative DDL applied.";
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 2;
    await c.end();
    process.exit(2);
  }

  await c.query("begin");
  const existing = await c.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );

  if (existing.rows.length > 0) {
    report.alreadyRecorded = true;
    // Keep DDL present via idempotent statements (no-op when already applied).
    await c.query(sql);
  } else {
    await c.query(sql);
    const afterDdl = await loadSchema(c);
    const afterMismatches = collectMismatches(afterDdl);
    if (afterMismatches.length > 0) {
      await c.query("rollback");
      report.stopped = true;
      report.reason = "Post-DDL verification failed — history not recorded";
      report.mismatches = afterMismatches;
      report.schemaAfter = afterDdl;
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = 2;
      await c.end();
      process.exit(2);
    }
    await c.query(
      `insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)
       on conflict (version) do nothing`,
      [version, migrationName.replace(/\.sql$/, "")],
    );
    report.applied = true;
    report.historyRecorded = true;
  }
  await c.query("commit");

  report.schemaAfter = await loadSchema(c);
  const finalMismatches = collectMismatches(report.schemaAfter);
  if (finalMismatches.length > 0) {
    throw new Error(`Final verification failed: ${JSON.stringify(finalMismatches)}`);
  }

  const hist = await c.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  report.historyRow = hist.rows[0] ?? null;
  if (!report.historyRow) {
    throw new Error("schema_migrations still missing version 422 after apply");
  }
  report.historyRecorded = true;
  report.neighbors = (
    await c.query(
      `select version, name from supabase_migrations.schema_migrations
        where version in ('421', '422', '423') order by version`,
    )
  ).rows;

  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await c.query("rollback").catch(() => {});
  throw error;
} finally {
  await c.end();
}
