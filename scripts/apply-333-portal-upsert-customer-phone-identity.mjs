/**
 * Apply ONLY migration 333 transactionally (Gap 1 portal atomic identity).
 * Does NOT use supabase db push. Does NOT apply other migrations.
 * Does NOT execute portal upserts — only replaces function definitions (DDL).
 *
 * Run: node scripts/apply-333-portal-upsert-customer-phone-identity.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: false });
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const migrationName = "333_portal_upsert_customer_phone_identity.sql";
const version = "333";
const sqlPath = resolve(root, "supabase/migrations", migrationName);
const sql = readFileSync(sqlPath, "utf8");

const EXPECTED = {
  customers: 71,
  nonempty_phones: 68,
  phone_e164: 44,
  marketing_campaigns: 1,
  marketing_campaign_recipients: 1,
  notification_queue: 117,
};

const OLD_ARGS =
  "p_company_id uuid, p_name text, p_email text, p_phone text, p_owner_user_id uuid, p_preferred_language text, p_marketing_consent boolean";

async function snapshot(client) {
  const customers = (
    await client.query(`select count(*)::int as n from public.customers`)
  ).rows[0].n;
  const nonempty_phones = (
    await client.query(
      `select count(*)::int as n from public.customers
       where nullif(btrim(coalesce(phone, '')), '') is not null`,
    )
  ).rows[0].n;
  const phone_e164 = (
    await client.query(
      `select count(*)::int as n from public.customers where phone_e164 is not null`,
    )
  ).rows[0].n;
  const marketing_campaigns = (
    await client.query(`select count(*)::int as n from public.marketing_campaigns`)
  ).rows[0].n;
  const marketing_campaign_recipients = (
    await client.query(
      `select count(*)::int as n from public.marketing_campaign_recipients`,
    )
  ).rows[0].n;
  const notification_queue = (
    await client.query(`select count(*)::int as n from public.notification_queue`)
  ).rows[0].n;

  const phoneFingerprint = (
    await client.query(
      `select md5(string_agg(
         id::text || '|' || coalesce(phone,'') || '|' || coalesce(phone_e164,'') || '|' ||
         coalesce(phone_country_iso,'') || '|' || coalesce(phone_region_source,'') || '|' ||
         coalesce(phone_national,''),
         E'\\n' order by id
       )) as fp
       from public.customers`,
    )
  ).rows[0].fp;

  const queueMax = (
    await client.query(
      `select coalesce(max(updated_at), max(created_at)) as m from public.notification_queue`,
    )
  ).rows[0].m;

  return {
    customers,
    nonempty_phones,
    phone_e164,
    marketing_campaigns,
    marketing_campaign_recipients,
    notification_queue,
    phoneFingerprint,
    queueMax: queueMax ? String(queueMax) : null,
  };
}

async function rpcSignatures(client) {
  const r = await client.query(`
    select n.nspname as schema, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'portal_upsert_customer'
      and n.nspname in ('public', 'internal')
    order by 1, 2
  `);
  return r.rows;
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const report = {
  ok: false,
  migration: migrationName,
  sqlSha256: createHash("sha256").update(sql).digest("hex"),
  before: {},
  after: {},
  rpcBefore: [],
  rpcAfter: [],
  registered: false,
  skipped: false,
  customerDataChanged: null,
  countsMatchExpected: null,
};

try {
  // Safety: migration file must not contain top-level DML against business tables.
  // Function bodies may contain INSERT/UPDATE for future portal calls — that is OK;
  // applying CREATE FUNCTION does not execute those statements.
  const stripped = sql
    .replace(/\$\$[\s\S]*?\$\$/g, "$$ /* body omitted */ $$")
    .replace(/\$w\$[\s\S]*?\$w\$/g, "$w$ /* body omitted */ $w$");
  if (
    /\b(update|delete|insert\s+into)\s+public\.(customers|marketing_campaigns|marketing_campaign_recipients|notification_queue|channel_delivery_events)\b/i.test(
      stripped,
    )
  ) {
    throw new Error(
      "STOP: migration 333 appears to contain top-level business-data DML outside function bodies",
    );
  }

  const existing = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  if (existing.rowCount > 0) {
    report.skipped = true;
    report.ok = true;
    report.existing = existing.rows[0];
    report.rpcAfter = await rpcSignatures(client);
    writeFileSync(
      resolve(root, "scripts/_tmp-333-apply-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  report.rpcBefore = await rpcSignatures(client);
  const publicBefore = report.rpcBefore.find((r) => r.schema === "public");
  if (!publicBefore || publicBefore.args !== OLD_ARGS) {
    throw new Error(
      `Precondition failed: expected old 7-arg public.portal_upsert_customer, got: ${JSON.stringify(publicBefore)}`,
    );
  }
  const internalBefore = report.rpcBefore.find((r) => r.schema === "internal");
  if (!internalBefore || internalBefore.args !== OLD_ARGS) {
    throw new Error(
      `Precondition failed: expected old 7-arg internal.portal_upsert_customer, got: ${JSON.stringify(internalBefore)}`,
    );
  }

  report.before = await snapshot(client);
  for (const [k, v] of Object.entries(EXPECTED)) {
    if (report.before[k] !== v) {
      throw new Error(
        `Precondition failed: expected ${k}=${v}, got ${report.before[k]}`,
      );
    }
  }
  report.countsMatchExpected = true;

  await client.query("begin");
  await client.query(sql);
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ($1, $2)`,
    [version, "portal_upsert_customer_phone_identity"],
  );
  await client.query("commit");
  report.registered = true;

  report.after = await snapshot(client);
  report.rpcAfter = await rpcSignatures(client);
  report.customerDataChanged =
    report.before.phoneFingerprint !== report.after.phoneFingerprint;

  const registered = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  report.migrationRow = registered.rows[0] ?? null;

  if (report.customerDataChanged) {
    throw new Error("STOP: customer phone fingerprint changed after DDL apply");
  }
  for (const [k, v] of Object.entries(EXPECTED)) {
    if (report.after[k] !== v) {
      throw new Error(`STOP: count drift after apply: ${k} expected ${v} got ${report.after[k]}`);
    }
  }

  const newArgsOk = report.rpcAfter.every(
    (r) =>
      r.args.includes("p_phone_e164") &&
      r.args.includes("p_phone_country_iso") &&
      r.args.includes("p_phone_region_source") &&
      r.args.includes("p_phone_national"),
  );
  if (!newArgsOk || report.rpcAfter.length < 2) {
    throw new Error(
      `STOP: RPC signature after apply missing identity args: ${JSON.stringify(report.rpcAfter)}`,
    );
  }

  report.ok = true;
  writeFileSync(
    resolve(root, "scripts/_tmp-333-apply-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
  writeFileSync(
    resolve(root, "scripts/_tmp-333-apply-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await client.end();
}
