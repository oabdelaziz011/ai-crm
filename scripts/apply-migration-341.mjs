/**
 * Apply migration 341 when local `supabase` CLI fails (e.g. macOS 12 ICU dyld crash).
 *
 * Run from repo root:
 *   node scripts/apply-migration-341.mjs
 *
 * Requires DATABASE_URL in `.env`, or SUPABASE_DB_PASSWORD + SUPABASE_URL to build it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";

const root = resolve(import.meta.dirname, "..");
const env = loadProjectEnv(root);
const url = env.DATABASE_URL;

if (!url?.trim()) {
  console.error("DATABASE_URL missing — set it in `.env` or SUPABASE_DB_PASSWORD + SUPABASE_URL.");
  process.exit(1);
}

const companyId = "d4fdae9a-bb72-4bae-903c-cb4b971d18a8";
const migrationPath = resolve(root, "supabase/migrations/341_cvp_handoff_auto_routing.sql");
const sql = readFileSync(migrationPath, "utf8");

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  console.log("Applying 341_cvp_handoff_auto_routing.sql ...");
  await client.query("BEGIN");
  await client.query(sql);
  await client.query(`
    insert into supabase_migrations.schema_migrations (version, name)
    values ('341', '341_cvp_handoff_auto_routing')
    on conflict (version) do nothing
  `);
  await client.query("COMMIT");
  console.log("OK — migration 341 applied and recorded in schema_migrations.");

  const { rows } = await client.query(
    `
    select
      (select count(*)::int from public.handoff_queues q
         where q.company_id = $1 and q.slug = 'support' and q.deleted_at is null) as queue_count,
      (select count(*)::int from public.handoff_escalation_rules r
         where r.company_id = $1 and r.trigger_code = 'customer_requested' and r.deleted_at is null) as rule_count,
      (select count(*)::int from public.handoff_queue_members m
         where m.company_id = $1 and m.is_active = true) as member_count
    `,
    [companyId],
  );
  console.table(rows);
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.end();
}
