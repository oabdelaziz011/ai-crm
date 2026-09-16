/**
 * Apply ONLY migration 351 (dual currency architecture) transactionally.
 * Used because `supabase db push --linked` is blocked by remote-only version 348
 * (resource_consultation_price) which has no local file.
 *
 * Does NOT charge payments. Does NOT invent FX. Does NOT rewrite invoice amounts.
 * Registers version 351 in supabase_migrations.schema_migrations.
 *
 * Run: node scripts/apply-351-dual-currency-architecture.mjs
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

const migrationName = "351_dual_currency_architecture.sql";
const version = "351";
const sqlPath = resolve(root, "supabase/migrations", migrationName);
const sql = readFileSync(sqlPath, "utf8");

async function verifyObjects(client) {
  const cols = await client.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'company_commercial_terms' and column_name = 'subscription_billing_currency')
        or (table_name = 'company_subscriptions' and column_name = 'billing_currency')
        or (table_name = 'plans' and column_name = 'pricing_currency')
      )
    order by 1, 2
  `);

  const fns = await client.query(`
    select n.nspname || '.' || p.proname as name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname in (
      'resolve_company_operational_currency',
      'resolve_subscription_billing_currency',
      '_assert_checkout_subscription_currency',
      'upsert_company_commercial_terms_v1',
      'resolve_company_payable_amount'
    )
    order by 1, 2
  `);

  return { columns: cols.rows, functions: fns.rows };
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
  alreadyApplied: false,
  applied: false,
  registered: false,
  before: null,
  after: null,
  migrationRow: null,
  separationSample: null,
};

try {
  if (!sql.includes("Dual currency architecture") || !sql.includes("subscription_billing_currency")) {
    throw new Error("STOP: migration file does not look like dual-currency 351");
  }

  const existing = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  if (existing.rowCount > 0) {
    report.alreadyApplied = true;
    report.ok = true;
    report.migrationRow = existing.rows[0];
    report.after = await verifyObjects(client);
    writeFileSync(
      resolve(root, "scripts/_tmp-351-apply-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  report.before = await verifyObjects(client);
  if (report.before.columns.length > 0) {
    throw new Error(
      "STOP: partial 351 columns already exist but version is not registered — inspect manually",
    );
  }

  await client.query("begin");
  await client.query(sql);
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ($1, $2)`,
    [version, "dual_currency_architecture"],
  );
  await client.query("commit");
  report.applied = true;
  report.registered = true;

  report.after = await verifyObjects(client);
  const registered = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  report.migrationRow = registered.rows[0] ?? null;

  const requiredCols = [
    "company_commercial_terms.subscription_billing_currency",
    "company_subscriptions.billing_currency",
    "plans.pricing_currency",
  ];
  const present = new Set(
    report.after.columns.map((c) => `${c.table_name}.${c.column_name}`),
  );
  for (const col of requiredCols) {
    if (!present.has(col)) throw new Error(`STOP: missing column ${col}`);
  }

  const requiredFns = [
    "public.resolve_company_operational_currency",
    "public.resolve_subscription_billing_currency",
    "public._assert_checkout_subscription_currency",
    "public.resolve_company_payable_amount",
  ];
  const fnNames = new Set(report.after.functions.map((f) => f.name));
  for (const name of requiredFns) {
    if (!fnNames.has(name)) throw new Error(`STOP: missing function ${name}`);
  }

  const upsert = report.after.functions.find(
    (f) => f.name === "public.upsert_company_commercial_terms_v1",
  );
  if (!upsert?.args.includes("p_subscription_billing_currency")) {
    throw new Error(`STOP: upsert missing subscription currency arg: ${JSON.stringify(upsert)}`);
  }

  // Safe read-only separation probe on one company if available.
  const sample = await client.query(`
    select
      c.id as company_id,
      public.resolve_company_operational_currency(c.id) as operational,
      public.resolve_subscription_billing_currency(c.id) as subscription
    from public.companies c
    order by c.created_at nulls last
    limit 1
  `);
  let payableCurrency = null;
  if (sample.rows[0]) {
    try {
      await client.query("select set_config('role', 'service_role', true)");
      const payable = await client.query(
        `select public.resolve_company_payable_amount($1)->>'currency' as currency`,
        [sample.rows[0].company_id],
      );
      payableCurrency = payable.rows[0]?.currency ?? null;
    } catch (err) {
      payableCurrency = `error:${err instanceof Error ? err.message : String(err)}`;
    }
  }
  report.separationSample = {
    ...(sample.rows[0] ?? null),
    payable_currency: payableCurrency,
  };

  report.ok = true;
  writeFileSync(
    resolve(root, "scripts/_tmp-351-apply-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    // ignore
  }
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
  writeFileSync(
    resolve(root, "scripts/_tmp-351-apply-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
} finally {
  await client.end();
}
