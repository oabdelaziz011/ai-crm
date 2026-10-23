/**
 * Apply migration 424 on LOCAL Postgres only (127.0.0.1:54322).
 * Does not touch production. Idempotent CHECK swap for price_tax_mode.
 *
 * Run: node scripts/apply-424-tax-unspecified-local.mjs
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
  throw new Error("Refusing to apply migration 424 against a production DATABASE_URL.");
}

const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing non-local host: ${parsed.hostname}`);
}
if (parsed.port !== "54322") {
  throw new Error(`Refusing non-local Postgres port: ${parsed.port || "(default)"}`);
}

const migrationName = "424_catalog_product_price_tax_unspecified.sql";
const version = "424";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const c = new pg.Client({ connectionString: databaseUrl });
await c.connect();

try {
  const history = await c.query(
    `select version from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  const alreadyRecorded = history.rowCount > 0;

  await c.query("begin");
  await c.query(sql);
  if (!alreadyRecorded) {
    await c.query(
      `insert into supabase_migrations.schema_migrations (version, name)
       values ($1, $2)
       on conflict (version) do nothing`,
      [version, migrationName.replace(/\.sql$/, "")],
    );
  }
  await c.query("commit");

  const check = await c.query(`
    select pg_get_constraintdef(oid) as def
    from pg_constraint
    where conname = 'catalog_products_price_tax_mode_check'
  `);

  console.log(
    JSON.stringify(
      {
        migration: migrationName,
        database: `${parsed.hostname}:${parsed.port}`,
        alreadyRecorded,
        historyRecorded: !alreadyRecorded,
        check: check.rows[0]?.def ?? null,
      },
      null,
      2,
    ),
  );
} catch (error) {
  try {
    await c.query("rollback");
  } catch {
    // ignore
  }
  throw error;
} finally {
  await c.end();
}
