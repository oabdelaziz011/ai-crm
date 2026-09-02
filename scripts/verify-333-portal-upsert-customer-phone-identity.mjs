/**
 * Post-apply verification for migration 333 only.
 * Read-only — no customer/queue/campaign writes. No Meta.
 *
 * Run: node scripts/verify-333-portal-upsert-customer-phone-identity.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: false });
const sql = readFileSync(
  resolve(root, "supabase/migrations/333_portal_upsert_customer_phone_identity.sql"),
  "utf8",
);

const EXPECTED = {
  customers: 71,
  nonempty_phones: 68,
  phone_e164: 44,
  marketing_campaigns: 1,
  marketing_campaign_recipients: 1,
  notification_queue: 117,
};

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const report = { ok: false, checks: {} };

function assert(name, cond, detail = null) {
  report.checks[name] = { ok: Boolean(cond), detail };
  if (!cond) throw new Error(`CHECK FAILED: ${name} ${detail ?? ""}`);
}

await client.connect();
try {
  const mig = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = '333'`,
  );
  assert("migration_registered", mig.rowCount === 1, mig.rows[0]);

  const sigs = await client.query(`
    select n.nspname as schema, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'portal_upsert_customer'
      and n.nspname in ('public', 'internal')
    order by 1, 2
  `);
  assert("two_schemas", sigs.rowCount === 2, sigs.rows);
  for (const row of sigs.rows) {
    assert(
      `${row.schema}_has_identity_args`,
      row.args.includes("p_phone_e164 text") &&
        row.args.includes("p_phone_country_iso text") &&
        row.args.includes("p_phone_region_source text") &&
        row.args.includes("p_phone_national text"),
      row.args,
    );
  }

  const def = await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'internal' and p.proname = 'portal_upsert_customer'
  `);
  const body = def.rows[0]?.def ?? "";
  assert("def_validates_e164", /invalid phone_e164 format/i.test(body));
  assert("def_inserts_identity_cols", /phone_e164/i.test(body) && /phone_national/i.test(body));
  assert(
    "def_preserves_existing_phone",
    /Existing match: preserve phone/i.test(body) ||
      (/update public\.customers/i.test(body) &&
        /set name = p_name/i.test(body) &&
        !/set[\s\S]*phone\s*=/i.test(body.split("else")[1] ?? "")),
  );
  assert("migration_mentions_identity", /p_phone_e164/.test(sql));

  const counts = {
    customers: (
      await client.query(`select count(*)::int as n from public.customers`)
    ).rows[0].n,
    nonempty_phones: (
      await client.query(
        `select count(*)::int as n from public.customers
         where nullif(btrim(coalesce(phone, '')), '') is not null`,
      )
    ).rows[0].n,
    phone_e164: (
      await client.query(
        `select count(*)::int as n from public.customers where phone_e164 is not null`,
      )
    ).rows[0].n,
    marketing_campaigns: (
      await client.query(`select count(*)::int as n from public.marketing_campaigns`)
    ).rows[0].n,
    marketing_campaign_recipients: (
      await client.query(
        `select count(*)::int as n from public.marketing_campaign_recipients`,
      )
    ).rows[0].n,
    notification_queue: (
      await client.query(`select count(*)::int as n from public.notification_queue`)
    ).rows[0].n,
  };
  report.counts = counts;
  for (const [k, v] of Object.entries(EXPECTED)) {
    assert(`count_${k}`, counts[k] === v, { expected: v, actual: counts[k] });
  }

  report.ok = true;
  writeFileSync(
    resolve(root, "scripts/_tmp-333-verify-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
  writeFileSync(
    resolve(root, "scripts/_tmp-333-verify-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await client.end();
}
