/**
 * Part 1 — Commercial SaaS payment foundation hardening.
 * Run: node scripts/verify-274-commercial-saas-payment-foundation.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root);
if (!env.DATABASE_URL?.trim()) {
  console.log("DATABASE_URL missing — skip");
  process.exit(0);
}

const migrationSql = readFileSync(
  resolve(root, "supabase/migrations/274_commercial_saas_payment_foundation.sql"),
  "utf8",
);

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("\nPart 1 — Commercial SaaS payment foundation\n");

async function expectFail(label, fn) {
  await client.query(`savepoint ${label}`);
  let failed = false;
  try {
    await fn();
  } catch {
    failed = true;
    await client.query(`rollback to savepoint ${label}`);
  }
  assert.equal(failed, true, `expected failure: ${label}`);
}

try {
  // Apply migration (idempotent-ish for re-runs)
  await client.query(migrationSql);
  console.log("  ✓ migration 274 applied");

  await client.query("begin");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', true)");
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");

  // Schema checks
  const col = await client.query(`
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'billing_payments'
      and column_name = 'idempotency_key'
  `);
  assert.equal(col.rowCount, 1);

  const idx = await client.query(`
    select indexname from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'idx_billing_payments_provider_payment_unique',
        'idx_billing_payments_idempotency_unique'
      )
    order by indexname
  `);
  assert.equal(idx.rowCount, 2);

  const overloads = await client.query(`
    select pg_get_function_identity_arguments(oid) as args
    from pg_proc
    where proname = 'renew_subscription_from_payment'
      and pronamespace = 'public'::regnamespace
  `);
  assert.ok(overloads.rowCount >= 1, JSON.stringify(overloads.rows));
  assert.ok(
    overloads.rows.some((r) => /p_amount_mode/.test(r.args)),
    "renew_subscription_from_payment must include p_amount_mode",
  );
  // Part 3 may add p_advance_period; drop legacy same-arity conflict if both exist in this DB.
  if (overloads.rows.some((r) => /p_advance_period/.test(r.args))) {
    await client.query(`
      drop function if exists public.renew_subscription_from_payment(
        uuid, numeric, text, text, text, text, jsonb, text, text, text, uuid
      )
    `);
  }
  console.log("  ✓ schema + hardened RPC signature");

  const pack = await client.query(`
    select public.upsert_commercial_package_v1(
      'p274_pack', 'P274 Pack', null, 'P274 Pack', 'fixed pack',
      50, 500, true, false, true, 274, 0,
      '{}'::jsonb, null, null, null, null, 'fixed'
    ) as r
  `);
  const packId = pack.rows[0].r.id;

  const co = await client.query(`
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'P274 '||gen_random_uuid()::text,
      'Active', 'Pro', 'active', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `);
  const companyId = co.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [companyId]);
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [
    companyId,
    packId,
  ]);

  const sub0 = await client.query(
    `select id, current_period_end, status from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  const subscriptionId = sub0.rows[0].id;
  const periodEnd0 = sub0.rows[0].current_period_end;

  // Resolve currency via billing settings (platform or company)
  const currencyRow = await client.query(
    `select coalesce(
       nullif(trim(public.resolve_billing_setting_value('default_currency', $1)#>>'{}'), ''),
       nullif(trim(public.resolve_billing_setting_value('default_currency', null)#>>'{}'), '')
     ) as c`,
    [companyId],
  );
  const currency = currencyRow.rows[0].c;
  assert.ok(currency, "default_currency must be configured");

  // 1. First payment succeeds (manual — admin path)
  const first = await client.query(
    `select public.renew_subscription_from_payment(
       $1, 50, $2, 'Manual', 'manual', null, '{}'::jsonb, 'manual',
       null, 'manual', $3
     ) as r`,
    [companyId, currency, subscriptionId],
  );
  assert.equal(first.rows[0].r.idempotent_replay, false);
  assert.ok(first.rows[0].r.payment_id);
  assert.ok(first.rows[0].r.invoice_id);
  assert.ok(first.rows[0].r.receipt_id);

  const sub1 = await client.query(
    `select current_period_end, status from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  assert.equal(sub1.rows[0].status, "active");
  assert.ok(sub1.rows[0].current_period_end > periodEnd0);
  const periodEnd1 = sub1.rows[0].current_period_end;
  console.log("  ✓ first manual payment succeeds + extends period");

  // 2. Same idempotency key twice → one settlement
  const idempKey = `p274-idemp-${companyId}`;
  const a = await client.query(
    `select public.renew_subscription_from_payment(
       $1, 50, $2, 'Manual', 'manual', null, '{}'::jsonb, 'manual',
       $3, 'manual', $4
     ) as r`,
    [companyId, currency, idempKey, subscriptionId],
  );
  const periodAfterA = (
    await client.query(
      `select current_period_end from public.company_subscriptions where company_id = $1`,
      [companyId],
    )
  ).rows[0].current_period_end;

  const b = await client.query(
    `select public.renew_subscription_from_payment(
       $1, 50, $2, 'Manual', 'manual', null, '{}'::jsonb, 'manual',
       $3, 'manual', $4
     ) as r`,
    [companyId, currency, idempKey, subscriptionId],
  );
  assert.equal(b.rows[0].r.idempotent_replay, true);
  assert.equal(b.rows[0].r.payment_id, a.rows[0].r.payment_id);

  const periodAfterB = (
    await client.query(
      `select current_period_end from public.company_subscriptions where company_id = $1`,
      [companyId],
    )
  ).rows[0].current_period_end;
  assert.equal(String(periodAfterB), String(periodAfterA));
  console.log("  ✓ idempotency key replay does not extend twice");

  // 3. Same provider payment ID twice → one settlement
  const providerPayId = `prov-p274-${companyId}`;
  const p1 = await client.query(
    `select public.renew_subscription_from_payment(
       $1, 50, $2, 'Card', 'sandbox', $3, '{}'::jsonb, 'manual',
       null, 'manual', $4
     ) as r`,
    [companyId, currency, providerPayId, subscriptionId],
  );
  const periodAfterP1 = (
    await client.query(
      `select current_period_end from public.company_subscriptions where company_id = $1`,
      [companyId],
    )
  ).rows[0].current_period_end;

  const p2 = await client.query(
    `select public.renew_subscription_from_payment(
       $1, 50, $2, 'Card', 'sandbox', $3, '{}'::jsonb, 'manual',
       null, 'manual', $4
     ) as r`,
    [companyId, currency, providerPayId, subscriptionId],
  );
  assert.equal(p2.rows[0].r.idempotent_replay, true);
  assert.equal(p2.rows[0].r.payment_id, p1.rows[0].r.payment_id);
  const periodAfterP2 = (
    await client.query(
      `select current_period_end from public.company_subscriptions where company_id = $1`,
      [companyId],
    )
  ).rows[0].current_period_end;
  assert.equal(String(periodAfterP2), String(periodAfterP1));
  console.log("  ✓ provider_payment_id replay does not extend twice");

  // 5–6. Wrong amount / currency rejected in list_price mode
  await expectFail("wrong_amount", () =>
    client.query(
      `select public.renew_subscription_from_payment(
         $1, 999, $2, 'Manual', 'manual', null, '{}'::jsonb, 'manual',
         $3, 'list_price', $4
       )`,
      [companyId, currency, `bad-amt-${Date.now()}`, subscriptionId],
    ),
  );
  console.log("  ✓ list_price wrong amount rejected");

  await expectFail("wrong_currency", () =>
    client.query(
      `select public.renew_subscription_from_payment(
         $1, 50, 'ZZZ', 'Manual', 'manual', null, '{}'::jsonb, 'manual',
         $2, 'list_price', $3
       )`,
      [companyId, `bad-cur-${Date.now()}`, subscriptionId],
    ),
  );
  console.log("  ✓ wrong currency rejected");

  // 7. Wrong subscription id rejected
  await expectFail("wrong_sub", () =>
    client.query(
      `select public.renew_subscription_from_payment(
         $1, 50, $2, 'Manual', 'manual', null, '{}'::jsonb, 'manual',
         $3, 'manual', gen_random_uuid()
       )`,
      [companyId, currency, `bad-sub-${Date.now()}`],
    ),
  );
  console.log("  ✓ wrong subscription relationship rejected");

  // 8. Missing subscription rejected
  const orphan = await client.query(`
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'P274 orphan '||gen_random_uuid()::text,
      'Active', 'Basic', 'active', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `);
  await expectFail("no_sub", () =>
    client.query(
      `select public.renew_subscription_from_payment(
         $1, 50, $2, 'Manual', 'manual', null, '{}'::jsonb, 'manual'
       )`,
      [orphan.rows[0].id, currency],
    ),
  );
  console.log("  ✓ missing subscription rejected");

  // 9. list_price success + manual still works with custom amount
  const listOk = await client.query(
    `select public.renew_subscription_from_payment(
       $1, null, $2, 'Manual', 'manual', null, '{}'::jsonb, 'manual',
       $3, 'list_price', $4
     ) as r`,
    [companyId, currency, `list-ok-${Date.now()}`, subscriptionId],
  );
  assert.equal(listOk.rows[0].r.amount_mode, "list_price");
  assert.equal(listOk.rows[0].r.idempotent_replay, false);

  const manualCustom = await client.query(
    `select public.renew_subscription_from_payment(
       $1, 12.34, $2, 'Manual', 'manual', null, '{}'::jsonb, 'manual',
       $3, 'manual', $4
     ) as r`,
    [companyId, currency, `manual-custom-${Date.now()}`, subscriptionId],
  );
  assert.equal(manualCustom.rows[0].r.idempotent_replay, false);
  assert.ok(Number(manualCustom.rows[0].r.amount) >= 12.34);
  console.log("  ✓ list_price success + manual custom amount still works");

  // Payment counts: first + idemp + provider + list + manualCustom = 5 unique settlements
  // (idemp replay and provider replay do not add)
  const payCount = await client.query(
    `select count(*)::int as n from public.billing_payments where company_id = $1`,
    [companyId],
  );
  assert.equal(payCount.rows[0].n, 5, `expected 5 payments, got ${payCount.rows[0].n}`);

  // Static: UI hook still calls renew_subscription_from_payment (manual compatible)
  const hook = readFileSync(
    resolve(root, "artifacts/login-app/src/hooks/billing/use-record-subscription-payment.ts"),
    "utf8",
  );
  assert.match(hook, /renew_subscription_from_payment/);
  assert.doesNotMatch(hook, /p_amount_mode/);
  console.log("  ✓ platform record-payment hook remains manual-compatible");

  // Trial note: convert remains separate (no merge)
  assert.match(migrationSql, /amount_mode/);
  assert.doesNotMatch(migrationSql, /convert_trial_to_paid_v1/);
  console.log("  ✓ trial conversion not merged into payment settlement");

  await client.query("rollback");
  console.log("\nAll Part 1 payment foundation checks passed.\n");
} catch (err) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  console.error(err);
  process.exitCode = 1;
} finally {
  await client.end();
}
