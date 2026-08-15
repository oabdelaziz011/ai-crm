/**
 * Phase 7.4 — commercial package pricing model.
 * Run: node scripts/verify-269-commercial-package-pricing.mjs
 */
import assert from "node:assert/strict";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root);
if (!env.DATABASE_URL?.trim()) {
  console.log("DATABASE_URL missing — skip");
  process.exit(0);
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("\nPhase 7.4 commercial package pricing verification\n");

async function feature(companyId, code) {
  const r = await client.query(`select public.is_feature_enabled($1, $2) as e`, [companyId, code]);
  return Boolean(r.rows[0].e);
}

try {
  await client.query("begin");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', true)");
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");

  // 1 — pricing integrity
  const integrity = await client.query(
    `select public.verify_commercial_package_pricing_integrity_v1() as r`,
  );
  assert.equal(integrity.rows[0].r.ok, true, JSON.stringify(integrity.rows[0].r));
  assert.equal(integrity.rows[0].r.currency_authority, "billing_settings.default_currency");
  console.log("  ✓ package pricing integrity");

  // 2/3/4/5/6 — free / paid / custom / monthly / yearly
  const free = await client.query(`
    select public.upsert_commercial_package_v1(
      'price_free_p74', 'Free P74', null, 'Free P74', 'free pack',
      0, 0, true, false, true, 30, 0,
      '{}'::jsonb, null, null, null, null, 'free'
    ) as r
  `);
  assert.equal(free.rows[0].r.pricing_mode, "free");
  assert.equal(Number(free.rows[0].r.price_monthly), 0);

  const paid = await client.query(`
    select public.upsert_commercial_package_v1(
      'price_paid_p74', 'Paid P74', null, 'Paid P74', 'paid pack',
      100, 1000, true, false, true, 31, 1,
      '{}'::jsonb, null, null, null, null, 'fixed'
    ) as r
  `);
  const paidId = paid.rows[0].r.id;
  assert.equal(paid.rows[0].r.pricing_mode, "fixed");
  assert.equal(Number(paid.rows[0].r.price_monthly), 100);
  assert.equal(Number(paid.rows[0].r.price_yearly), 1000);

  const custom = await client.query(`
    select public.upsert_commercial_package_v1(
      'price_custom_p74', 'Custom P74', null, 'Custom P74', 'custom pack',
      0, 0, true, false, true, 32, 2,
      '{}'::jsonb, null, null, null, null, 'custom'
    ) as r
  `);
  assert.equal(custom.rows[0].r.pricing_mode, "custom");
  console.log("  ✓ free / fixed / custom pricing modes");

  // 9 — negative rejected
  await client.query("savepoint neg_price");
  let negBlocked = false;
  try {
    await client.query(`
      select public.upsert_commercial_package_v1(
        'price_neg_p74', 'Neg P74', null, 'Neg', 'bad',
        -1, 10, true, false, true, 33, 0,
        '{}'::jsonb, null, null, null, null, 'fixed'
      )
    `);
  } catch {
    negBlocked = true;
    await client.query("rollback to savepoint neg_price");
  }
  assert.equal(negBlocked, true);

  // 10 — fixed with 0/0 rejected
  await client.query("savepoint fixed_zero");
  let fixedZeroBlocked = false;
  try {
    await client.query(`
      select public.upsert_commercial_package_v1(
        'price_zero_fixed_p74', 'Zero Fixed', null, 'Zero Fixed', 'bad',
        0, 0, true, false, true, 34, 0,
        '{}'::jsonb, null, null, null, null, 'fixed'
      )
    `);
  } catch {
    fixedZeroBlocked = true;
    await client.query("rollback to savepoint fixed_zero");
  }
  assert.equal(fixedZeroBlocked, true);
  console.log("  ✓ invalid negative / fixed-zero pricing rejected");

  // Features for paid package + company for safety scenarios
  await client.query(`select public.set_commercial_package_features_v1($1, $2)`, [
    paidId,
    ["core_crm", "customers", "leads", "bookings"],
  ]);

  const co = await client.query(`
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'P74 Price '||gen_random_uuid()::text,
      'Active', 'Pro', 'active', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `);
  const companyId = co.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [companyId]);
  await client.query(
    `insert into public.company_subscriptions (company_id, status, billing_cycle)
     values ($1, 'active', 'monthly') on conflict (company_id) do nothing`,
    [companyId],
  );
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [
    companyId,
    paidId,
  ]);

  const before = await client.query(
    `select plan_id, package_feature_snapshot, billing_cycle, status,
            current_period_start, current_period_end
     from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  const snapBefore = JSON.stringify([...(before.rows[0].package_feature_snapshot ?? [])].sort());
  assert.equal(await feature(companyId, "leads"), true);

  await client.query(
    `select public.set_company_feature_grant($1, 'whatsapp_channel', true, 'manual', now(), null, 'p74-manual')`,
    [companyId],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'api_access', true, 'contract', now(), null, 'p74-contract')`,
    [companyId],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'omnichannel', true, 'trial', now(), null, 'p74-trial')`,
    [companyId],
  );

  // 11/12/13/14 — price update safety (Scenario A)
  await client.query(`
    select public.upsert_commercial_package_v1(
      'price_paid_p74', 'Paid P74', $1, 'Paid P74', 'paid pack',
      120, 1100, true, false, true, 31, 1,
      '{}'::jsonb, null, null, null, null, 'fixed'
    )
  `, [paidId]);

  const afterPrice = await client.query(
    `select plan_id, package_feature_snapshot, billing_cycle, status,
            current_period_start, current_period_end
     from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  assert.equal(afterPrice.rows[0].plan_id, before.rows[0].plan_id);
  assert.equal(
    JSON.stringify([...(afterPrice.rows[0].package_feature_snapshot ?? [])].sort()),
    snapBefore,
  );
  assert.equal(afterPrice.rows[0].billing_cycle, before.rows[0].billing_cycle);
  assert.equal(afterPrice.rows[0].status, before.rows[0].status);
  assert.equal(await feature(companyId, "leads"), true);
  assert.equal(await feature(companyId, "whatsapp_channel"), true);
  assert.equal(await feature(companyId, "api_access"), true);
  assert.equal(await feature(companyId, "omnichannel"), true);
  assert.equal(await feature(companyId, "core_crm"), true);
  console.log("  ✓ catalog price change does not mutate snapshot/grants/lifecycle");

  const priceAudit = await client.query(`
    select count(*)::int as n from public.billing_audit_logs
    where event_type = 'package_price_updated'
      and (metadata->>'package_id') = $1::text
  `, [paidId]);
  assert.ok(priceAudit.rows[0].n >= 1);
  console.log("  ✓ package_price_updated audit written");

  // 15 — feature edit safety
  await client.query(`select public.set_commercial_package_features_v1($1, $2)`, [
    paidId,
    ["core_crm", "customers", "bookings"],
  ]);
  assert.equal(await feature(companyId, "leads"), true);
  console.log("  ✓ catalog feature edit does not revoke existing grants");

  // 16 — deactivation
  await client.query(`
    select public.upsert_commercial_package_v1(
      'price_paid_p74', 'Paid P74', $1, 'Paid P74', 'paid pack',
      120, 1100, false, false, true, 31, 1,
      '{}'::jsonb, null, null, null, null, 'fixed'
    )
  `, [paidId]);
  assert.equal(await feature(companyId, "leads"), true);
  console.log("  ✓ deactivation does not revoke access");

  // 21–28 — Phase 6 gates still apply
  await client.query(`update public.companies set approval_status = 'pending' where id = $1`, [
    companyId,
  ]);
  assert.equal(await feature(companyId, "leads"), false);
  assert.equal(await feature(companyId, "core_crm"), true);
  await client.query(
    `update public.companies set approval_status = 'approved', status = 'Suspended' where id = $1`,
    [companyId],
  );
  assert.equal(await feature(companyId, "leads"), false);
  console.log("  ✓ Phase 6 approval/suspension still enforced (pricing not an auth path)");

  // 22 — plan_features alone cannot authorize
  await client.query(`update public.companies set status = 'Active', approval_status = 'approved' where id = $1`, [
    companyId,
  ]);
  const other = await client.query(`
    select public.upsert_commercial_package_v1(
      'price_other_p74', 'Other P74', null, 'Other', 'other',
      50, 500, true, false, true, 35, 1,
      '{}'::jsonb, null, null, null, null, 'fixed'
    ) as r
  `);
  const otherId = other.rows[0].r.id;
  await client.query(
    `insert into public.plan_features (plan_id, feature_code, enabled)
     values ($1, 'advanced_reports', true)
     on conflict (plan_id, feature_code) do update set enabled = true`,
    [otherId],
  );
  assert.equal(await feature(companyId, "advanced_reports"), false);
  console.log("  ✓ plan_features cannot authorize access");

  await client.query("rollback");
  console.log("\nPhase 7.4 package pricing verification passed\n");
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
