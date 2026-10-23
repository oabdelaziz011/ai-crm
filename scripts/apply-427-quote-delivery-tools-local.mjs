/**
 * Apply migration 427 on LOCAL Postgres only (127.0.0.1:54322).
 * Seed-only tool_definitions upsert for request_send_quote + get_quote_delivery_status.
 * Does not widen create_draft_quote. Does not touch production.
 *
 * Run: node scripts/apply-427-quote-delivery-tools-local.mjs
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
  throw new Error("Refusing to apply migration 427 against a production DATABASE_URL.");
}

const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing non-local host: ${parsed.hostname}`);
}
if (parsed.port !== "54322") {
  throw new Error(`Refusing non-local Postgres port: ${parsed.port || "(default)"}`);
}

const migrationName = "427_ai_employee_quote_delivery_tools.sql";
const version = "427";
const predecessor = "426";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const TOOL_KEYS = ["request_send_quote", "get_quote_delivery_status", "create_draft_quote"];

function assertPerms(key, permsText, expected) {
  const parsedPerms = JSON.parse(permsText);
  if (
    parsedPerms.length !== expected.length ||
    !expected.every((p) => parsedPerms.includes(p))
  ) {
    throw new Error(`${key}: unexpected permissions ${permsText}`);
  }
  for (const banned of ["quotes.send", "quotes.approve", "quotes.delete"]) {
    if (key === "create_draft_quote" && parsedPerms.includes(banned)) {
      throw new Error(`${key}: banned permission present: ${banned}`);
    }
    if (key === "request_send_quote" && banned === "quotes.send" && parsedPerms.includes(banned)) {
      throw new Error(`${key}: must not require quotes.send`);
    }
  }
}

const c = new pg.Client({ connectionString: databaseUrl });
await c.connect();

try {
  const prior = await c.query(
    `select version from supabase_migrations.schema_migrations where version = $1`,
    [predecessor],
  );
  if (prior.rowCount === 0) {
    throw new Error(`Refuse apply: local history missing ${predecessor} (expected predecessor).`);
  }

  const history = await c.query(
    `select version from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  const alreadyRecorded = history.rowCount > 0;

  const before = await c.query(
    `select key, required_permissions::text as perms
     from public.tool_definitions where key = any($1::text[])`,
    [TOOL_KEYS],
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

  // Idempotent re-seed
  await c.query(sql);

  const after = await c.query(
    `select key, required_permissions::text as perms, category, is_enabled::text as enabled
     from public.tool_definitions where key = any($1::text[]) order by key`,
    [TOOL_KEYS],
  );
  const counts = await c.query(
    `select key, count(*)::int as n from public.tool_definitions
     where key = any($1::text[]) group by key order by key`,
    [TOOL_KEYS],
  );
  const recorded = await c.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );

  const byKey = Object.fromEntries(after.rows.map((r) => [r.key, r]));
  if (!byKey.request_send_quote) throw new Error("request_send_quote missing after apply");
  if (!byKey.get_quote_delivery_status) throw new Error("get_quote_delivery_status missing after apply");
  if (!byKey.create_draft_quote) throw new Error("create_draft_quote missing after apply");

  assertPerms("request_send_quote", byKey.request_send_quote.perms, ["tools.execute", "quotes.edit"]);
  assertPerms("get_quote_delivery_status", byKey.get_quote_delivery_status.perms, [
    "tools.execute",
    "quotes.view",
  ]);
  assertPerms("create_draft_quote", byKey.create_draft_quote.perms, ["tools.execute", "quotes.create"]);

  for (const row of counts.rows) {
    if (row.n !== 1) throw new Error(`${row.key}: expected 1 row, got ${row.n}`);
  }

  console.log(
    JSON.stringify(
      {
        migration: migrationName,
        database: `${parsed.hostname}:${parsed.port}`,
        alreadyRecorded,
        historyRecorded: !alreadyRecorded,
        beforeKeys: before.rows.map((r) => r.key),
        after: after.rows,
        counts: Object.fromEntries(counts.rows.map((r) => [r.key, r.n])),
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
