/**
 * Apply migration 332 transactionally (Phase 2H.12 Phase A).
 * Does NOT use supabase db push.
 *
 * Run: node scripts/apply-332-customer-phone-identity-foundation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: false });
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const migrationName = "332_customer_phone_identity_foundation.sql";
const version = "332";
const sqlPath = resolve(root, "supabase/migrations", migrationName);
const sql = readFileSync(sqlPath, "utf8");

const COUNT_TABLES = [
  "customers",
  "marketing_campaigns",
  "marketing_campaign_recipients",
  "notification_queue",
  "channel_delivery_events",
];

async function counts(client) {
  const out = {};
  for (const t of COUNT_TABLES) {
    const r = await client.query(`select count(*)::int as n from public.${t}`);
    out[t] = r.rows[0].n;
  }
  return out;
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const report = {
  ok: false,
  migration: migrationName,
  before: {},
  after: {},
  registered: false,
  skipped: false,
};

try {
  const existing = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  if (existing.rowCount > 0) {
    report.skipped = true;
    report.ok = true;
    report.existing = existing.rows[0];
    writeFileSync(resolve(root, "scripts/_tmp-2h12-apply-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  // Preconditions
  const phoneCols = await client.query(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='customers'
       and column_name in ('phone_e164','phone_country_iso','phone_region_source','phone_national')`,
  );
  if (phoneCols.rowCount > 0) {
    throw new Error(
      `Precondition failed: derived phone columns already exist: ${phoneCols.rows
        .map((r) => r.column_name)
        .join(",")}`,
    );
  }

  const phoneUnique = await client.query(
    `select 1 from pg_indexes
     where schemaname='public' and indexname='idx_customers_company_phone_unique'`,
  );
  if (phoneUnique.rowCount === 0) {
    throw new Error("Precondition failed: idx_customers_company_phone_unique missing");
  }

  const rls = await client.query(
    `select relrowsecurity from pg_class where oid = 'public.customers'::regclass`,
  );
  if (!rls.rows[0]?.relrowsecurity) {
    throw new Error("Precondition failed: customers RLS not enabled");
  }

  report.before = await counts(client);

  await client.query("begin");
  await client.query(sql);
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ($1, $2)`,
    [version, "customer_phone_identity_foundation"],
  );
  await client.query("commit");
  report.registered = true;

  report.after = await counts(client);
  report.ok = true;
  writeFileSync(resolve(root, "scripts/_tmp-2h12-apply-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
  writeFileSync(resolve(root, "scripts/_tmp-2h12-apply-report.json"), JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await client.end();
}
