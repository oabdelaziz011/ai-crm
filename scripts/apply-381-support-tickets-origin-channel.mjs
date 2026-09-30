/**
 * Apply migration 381 — support_tickets.origin_channel (local only).
 * Run: node scripts/apply-381-support-tickets-origin-channel.mjs
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
  throw new Error("Refusing to apply migration 381 against a production DATABASE_URL.");
}

const migrationName = "381_support_tickets_origin_channel.sql";
const version = "381";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const c = new pg.Client({ connectionString: databaseUrl });
await c.connect();

const report = { migration: migrationName, applied: false, alreadyApplied: false, sample: null };

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

  const sample = await c.query(`
    select
      count(*)::int as total,
      count(origin_channel)::int as with_channel,
      count(*) filter (where origin_channel = 'email')::int as email,
      count(*) filter (where origin_channel = 'whatsapp')::int as whatsapp
    from public.support_tickets
    where deleted_at is null
  `);
  report.sample = sample.rows[0];

  await c.query("commit");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await c.query("rollback");
  throw error;
} finally {
  await c.end();
}
