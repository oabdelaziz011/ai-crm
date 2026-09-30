/**
 * Apply migration 379 — resync support ticket number sequence + collision-safe generator.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
const migrationName = "379_fix_support_ticket_number_sequence.sql";
const version = "379";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const c = new pg.Client({ connectionString: env.DATABASE_URL || process.env.DATABASE_URL });
await c.connect();

const report = { migration: migrationName, applied: false, alreadyApplied: false, probe: null };

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

  const seq = await c.query(`select last_value, is_called from support_ticket_number_seq`);
  const generated = await c.query(
    `select public.generate_support_ticket_number('2d27f7fb-c15e-4d60-84e9-1793f36f2172'::uuid) as n`,
  );
  const maxNum = await c.query(`
    select max(nullif(regexp_replace(ticket_number, '\\D', '', 'g'), '')::bigint) as max_num
    from support_tickets
  `);
  report.probe = {
    seq: seq.rows[0],
    generated: generated.rows[0],
    maxNum: maxNum.rows[0],
  };

  await c.query("commit");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await c.query("rollback");
  throw error;
} finally {
  await c.end();
}
