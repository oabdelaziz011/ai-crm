/**
 * Apply migration 426 on LOCAL Postgres only (127.0.0.1:54322).
 * Seed-only tool_definitions upsert — does not touch production.
 *
 * Run: node scripts/apply-426-create-draft-quote-local.mjs
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
  throw new Error("Refusing to apply migration 426 against a production DATABASE_URL.");
}

const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing non-local host: ${parsed.hostname}`);
}
if (parsed.port !== "54322") {
  throw new Error(`Refusing non-local Postgres port: ${parsed.port || "(default)"}`);
}

const migrationName = "426_ai_employee_create_draft_quote_tool.sql";
const version = "426";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const c = new pg.Client({ connectionString: databaseUrl });
await c.connect();

try {
  const prior425 = await c.query(
    `select version from supabase_migrations.schema_migrations where version = '425'`,
  );
  if (prior425.rowCount === 0) {
    throw new Error("Refuse apply: local history missing 425 (expected predecessor).");
  }

  const history = await c.query(
    `select version from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  const alreadyRecorded = history.rowCount > 0;

  const before = await c.query(
    `select key, required_permissions::text as perms, category, is_enabled
     from public.tool_definitions where key = 'create_draft_quote'`,
  );

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

  // Idempotent re-seed (must not duplicate or widen permissions)
  await c.query(sql);

  const after = await c.query(
    `select key, required_permissions::text as perms, category, is_enabled::text as enabled, timeout_ms
     from public.tool_definitions where key = 'create_draft_quote'`,
  );
  const count = await c.query(
    `select count(*)::int as n from public.tool_definitions where key = 'create_draft_quote'`,
  );
  const recorded = await c.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );

  const row = after.rows[0];
  if (!row) throw new Error("create_draft_quote missing after apply");
  if (count.rows[0].n !== 1) throw new Error(`expected exactly 1 row, got ${count.rows[0].n}`);
  if (row.perms !== '["tools.execute", "quotes.create"]' && row.perms !== '["tools.execute","quotes.create"]') {
    // jsonb may normalize spacing
    const parsedPerms = JSON.parse(row.perms);
    if (
      parsedPerms.length !== 2 ||
      !parsedPerms.includes("tools.execute") ||
      !parsedPerms.includes("quotes.create")
    ) {
      throw new Error(`unexpected permissions: ${row.perms}`);
    }
    for (const banned of ["quotes.send", "quotes.approve", "quotes.delete"]) {
      if (parsedPerms.includes(banned)) throw new Error(`banned permission present: ${banned}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        migration: migrationName,
        database: `${parsed.hostname}:${parsed.port}`,
        alreadyRecorded,
        historyRecorded: !alreadyRecorded,
        beforeCount: before.rowCount,
        after: row,
        rowCount: count.rows[0].n,
        schemaMigrations: recorded.rows[0] ?? null,
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
