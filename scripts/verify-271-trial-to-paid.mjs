/**
 * Phase 7.6 — trial → paid conversion foundation.
 * Run: node scripts/verify-271-trial-to-paid.mjs
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
console.log("\nPhase 7.6 trial → paid verification\n");

async function feature(companyId, code) {
  const r = await client.query(`select public.is_feature_enabled($1, $2) as e`, [companyId, code]);
  return Boolean(r.rows[0].e);
}

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

async function makeTrialCompany(suffix) {
  const co = await client.query(`
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'P76 '||$1||' '||gen_random_uuid()::text,
      'Trial', 'Basic', 'trialing', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `, [suffix]);
  const companyId = co.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [companyId]);
  return companyId;
}

try {
  await client.query("begin");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', true)");
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");

  const basic = await client.query(`select id from public.plans where code = 'basic' limit 1`);
  const pro = await client.query(`select id from public.plans where code = 'pro' limit 1`);
  const enterprise = await client.query(`select id from public.plans where code = 'enterprise' limit 1`);
  assert.ok(basic.rows[0]?.id && pro.rows[0]?.id && enterprise.rows[0]?.id);
  const basicId = basic.rows[0].id;
  const proId = pro.rows[0].id;
  const enterpriseId = enterprise.rows[0].id;

  // Ensure fixed pricing on stock packages
  await client.query(`
    update public.plans
    set pricing_mode = 'fixed',
        price_monthly = greatest(price_monthly, 29),
        price_yearly = greatest(price_yearly, 290)
    where code in ('basic','pro','enterprise')
  `);

  // Free / custom packages for rejection tests
  const free = await client.query(`
    select public.upsert_commercial_package_v1(
      'p76_free', 'P76 Free', null, 'P76 Free', 'free',
      0, 0, true, false, true, 90, 0,
      '{}'::jsonb, null, null, null, null, 'free'
    ) as r
  `);
  const freeId = free.rows[0].r.id;
  const custom = await client.query(`
    select public.upsert_commercial_package_v1(
      'p76_custom', 'P76 Custom', null, 'P76 Custom', 'custom',
      0, 0, true, false, true, 91, 0,
      '{}'::jsonb, null, null, null, null, 'custom'
    ) as r
  `);
  const customId = custom.rows[0].r.id;

  // ── Trial company with trial + manual + system grants
  const companyId = await makeTrialCompany("main");
  const trialEnds = new Date(Date.now() + 14 * 86400000).toISOString();
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle, trial_ends_at,
       current_period_start, current_period_end, auto_renewal
     ) values ($1, $2, 'trialing', 'monthly', $3, now(), $3, true)`,
    [companyId, basicId, trialEnds],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'leads', true, 'trial', now(), $2::timestamptz, 'p76-trial')`,
    [companyId, trialEnds],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'bookings', true, 'trial', now(), $2::timestamptz, 'p76-trial')`,
    [companyId, trialEnds],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'whatsapp_channel', true, 'manual', now(), null, 'p76-manual')`,
    [companyId],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'api_access', true, 'contract', now(), null, 'p76-contract')`,
    [companyId],
  );
  assert.equal(await feature(companyId, "leads"), true);
  assert.equal(await feature(companyId, "whatsapp_channel"), true);

  // Invalid: pending approval
  await client.query(`update public.companies set approval_status = 'pending' where id = $1`, [
    companyId,
  ]);
  await expectFail("pending_deny", () =>
    client.query(`select public.convert_trial_to_paid_v1($1, $2, 'monthly', 'x', 'admin')`, [
      companyId,
      proId,
    ]),
  );
  await client.query(`update public.companies set approval_status = 'rejected' where id = $1`, [
    companyId,
  ]);
  await expectFail("rejected_deny", () =>
    client.query(`select public.convert_trial_to_paid_v1($1, $2, 'monthly', 'x', 'admin')`, [
      companyId,
      proId,
    ]),
  );
  await client.query(`update public.companies set approval_status = 'approved' where id = $1`, [
    companyId,
  ]);
  console.log("  ✓ pending/rejected conversion denied");

  // Invalid: free / custom / cycle / inactive
  await expectFail("free_deny", () =>
    client.query(`select public.convert_trial_to_paid_v1($1, $2, 'monthly', 'x', 'admin')`, [
      companyId,
      freeId,
    ]),
  );
  await expectFail("custom_deny", () =>
    client.query(`select public.convert_trial_to_paid_v1($1, $2, 'monthly', 'x', 'admin')`, [
      companyId,
      customId,
    ]),
  );
  await expectFail("cycle_deny", () =>
    client.query(`select public.convert_trial_to_paid_v1($1, $2, 'quarterly', 'x', 'admin')`, [
      companyId,
      proId,
    ]),
  );
  console.log("  ✓ free/custom/invalid cycle rejected");

  // Convert Trial → Pro monthly
  const conv = await client.query(
    `select public.convert_trial_to_paid_v1($1, $2, 'monthly', 'p76 convert', 'admin') as r`,
    [companyId, proId],
  );
  assert.equal(conv.rows[0].r.status, "active");
  assert.equal(conv.rows[0].r.skipped, false);
  assert.equal(conv.rows[0].r.billing_cycle, "monthly");
  assert.ok(Number(conv.rows[0].r.trial_grants_expired) >= 1);

  const sub = await client.query(
    `select status, plan_id, billing_cycle, trial_ends_at, current_period_start, current_period_end,
            package_feature_snapshot
     from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  assert.equal(sub.rows[0].status, "active");
  assert.equal(sub.rows[0].plan_id, proId);
  assert.equal(sub.rows[0].billing_cycle, "monthly");
  assert.ok(sub.rows[0].trial_ends_at); // retained historically
  assert.ok(sub.rows[0].current_period_end > sub.rows[0].current_period_start);

  // Trial grants ineffective; package grants for Pro features; manual/contract survive
  assert.equal(await feature(companyId, "leads"), true); // in Pro package
  assert.equal(await feature(companyId, "whatsapp_channel"), true); // manual
  assert.equal(await feature(companyId, "api_access"), true); // contract
  assert.equal(await feature(companyId, "core_crm"), true);

  const trialActive = await client.query(
    `select count(*)::int as n from public.company_feature_overrides
     where company_id = $1 and source = 'trial' and is_active = true`,
    [companyId],
  );
  assert.equal(trialActive.rows[0].n, 0);

  const pkgActive = await client.query(
    `select count(*)::int as n from public.company_feature_overrides
     where company_id = $1 and source = 'package' and is_active = true`,
    [companyId],
  );
  assert.ok(pkgActive.rows[0].n >= 1);
  console.log("  ✓ Trial → Pro monthly: active, trial grants expired, package/manual/contract OK");

  // Idempotent same package/cycle
  const again = await client.query(
    `select public.convert_trial_to_paid_v1($1, $2, 'monthly', 'again', 'admin') as r`,
    [companyId, proId],
  );
  assert.equal(again.rows[0].r.skipped, true);
  console.log("  ✓ duplicate conversion idempotent (already_active)");

  // Active different package rejected
  await expectFail("active_other", () =>
    client.query(`select public.convert_trial_to_paid_v1($1, $2, 'yearly', 'x', 'admin')`, [
      companyId,
      enterpriseId,
    ]),
  );

  // Audit event
  const audit = await client.query(
    `select count(*)::int as n from public.billing_audit_logs
     where company_id = $1 and event_type = 'trial_converted_to_paid'`,
    [companyId],
  );
  assert.ok(audit.rows[0].n >= 1);
  console.log("  ✓ trial_converted_to_paid audit written");

  // Yearly Basic conversion on fresh trial
  const c2 = await makeTrialCompany("yearly");
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle, trial_ends_at,
       current_period_start, current_period_end, auto_renewal
     ) values ($1, $2, 'trialing', 'monthly', now() + interval '10 days', now(), now() + interval '10 days', true)`,
    [c2, proId],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'opportunities', true, 'trial', now(), now() + interval '10 days', 't')`,
    [c2],
  );
  const y = await client.query(
    `select public.convert_trial_to_paid_v1($1, $2, 'yearly', 'yearly', 'admin') as r`,
    [c2, basicId],
  );
  assert.equal(y.rows[0].r.billing_cycle, "yearly");
  assert.equal(await feature(c2, "bookings"), true); // basic package
  // opportunities not in basic — trial expired and not in package
  assert.equal(await feature(c2, "opportunities"), false);
  console.log("  ✓ Trial → Basic yearly; non-package trial feature removed");

  // Enterprise conversion
  const c3 = await makeTrialCompany("ent");
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle, trial_ends_at, auto_renewal
     ) values ($1, $2, 'trialing', 'monthly', now() + interval '5 days', true)`,
    [c3, basicId],
  );
  await client.query(`select public.convert_trial_to_paid_v1($1, $2, 'monthly', 'ent', 'admin')`, [
    c3,
    enterpriseId,
  ]);
  assert.equal(await feature(c3, "api_access"), true);
  assert.equal(await feature(c3, "workflow_automation"), true);
  console.log("  ✓ Trial → Enterprise provisions package features");

  // Suspended + trial: convert allowed but company stays Suspended
  const c4 = await makeTrialCompany("sus");
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle, trial_ends_at, auto_renewal
     ) values ($1, $2, 'trialing', 'monthly', now() + interval '5 days', true)`,
    [c4, basicId],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'leads', true, 'trial', now(), now() + interval '5 days', 't')`,
    [c4],
  );
  await client.query(`update public.companies set status = 'Suspended' where id = $1`, [c4]);
  await client.query(`select public.convert_trial_to_paid_v1($1, $2, 'monthly', 'sus', 'admin')`, [
    c4,
    proId,
  ]);
  const st = await client.query(
    `select c.status as company_status, cs.status as sub_status
     from public.companies c
     join public.company_subscriptions cs on cs.company_id = c.id
     where c.id = $1`,
    [c4],
  );
  assert.equal(st.rows[0].company_status, "Suspended");
  assert.equal(st.rows[0].sub_status, "active");
  assert.equal(await feature(c4, "leads"), false); // suspended denies commercial
  assert.equal(await feature(c4, "core_crm"), true);
  console.log("  ✓ suspended company: subscription activates, Suspended preserved, commercial denied");

  // Expired / canceled reject
  const c5 = await makeTrialCompany("exp");
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle, auto_renewal
     ) values ($1, $2, 'expired', 'monthly', false)`,
    [c5, basicId],
  );
  await expectFail("expired_deny", () =>
    client.query(`select public.convert_trial_to_paid_v1($1, $2, 'monthly', 'x', 'admin')`, [
      c5,
      proId,
    ]),
  );
  await client.query(
    `update public.company_subscriptions set status = 'canceled' where company_id = $1`,
    [c5],
  );
  await expectFail("canceled_deny", () =>
    client.query(`select public.convert_trial_to_paid_v1($1, $2, 'monthly', 'x', 'admin')`, [
      c5,
      proId,
    ]),
  );
  console.log("  ✓ expired/canceled conversion rejected");

  // Price change does not mutate grants after conversion
  await client.query(`
    select public.upsert_commercial_package_v1(
      'pro', 'Pro', $1, 'Pro', 'Pro',
      199, 1990, true, true, true, 20, 2,
      '{}'::jsonb, null, null, null, null, 'fixed'
    )
  `, [proId]);
  assert.equal(await feature(companyId, "whatsapp_channel"), true);
  console.log("  ✓ list price change does not mutate converted grants");

  await client.query("rollback");
  console.log("\nPhase 7.6 trial → paid verification passed\n");
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
