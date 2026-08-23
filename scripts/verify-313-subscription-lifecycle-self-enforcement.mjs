/**
 * Phase 313 — production subscription lifecycle self-enforcement.
 * Run: node scripts/verify-313-subscription-lifecycle-self-enforcement.mjs
 *
 * Uses disposable test companies inside a rolled-back transaction.
 * Does not modify real production customers.
 */
import assert from "node:assert/strict";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root);
if (!env.DATABASE_URL?.trim()) {
  console.log("DATABASE_URL missing — skip live verification");
  process.exit(0);
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("\n313 subscription lifecycle self-enforcement verification\n");

async function feature(companyId, code) {
  const r = await client.query(`select public.is_feature_enabled($1, $2) as e`, [companyId, code]);
  return Boolean(r.rows[0].e);
}

async function commerciallyExpired(companyId) {
  const r = await client.query(`select public.is_company_commercially_expired($1) as e`, [
    companyId,
  ]);
  return Boolean(r.rows[0].e);
}

async function grantActive(companyId, code, source) {
  const r = await client.query(
    `select is_active from public.company_feature_overrides
     where company_id = $1 and feature_code = $2 and source = $3 and is_active = true
     limit 1`,
    [companyId, code, source],
  );
  return Boolean(r.rows[0]?.is_active);
}

async function makeCompany(suffix, approval = "approved", companyStatus = "Active") {
  const co = await client.query(
    `
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'P313 '||$1||' '||gen_random_uuid()::text,
      $3, 'Basic', 'active', 'tenant',
      $2, now(), 'completed'
    ) returning id
  `,
    [suffix, approval, companyStatus],
  );
  const companyId = co.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [companyId]);
  return companyId;
}

async function subStatus(companyId) {
  const r = await client.query(
    `select status, grace_period_ends_at from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  return r.rows[0];
}

try {
  await client.query("begin");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', true)");
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");

  const basic = await client.query(`select id from public.plans where code = 'basic' limit 1`);
  assert.ok(basic.rows[0]?.id, "basic plan required");
  const basicId = basic.rows[0].id;

  const commercialCode = "ticketing";

  // TEST 1 — active before period end remains active + commercially entitled
  const activeOk = await makeCompany("active-ok");
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle,
       current_period_start, current_period_end, next_renewal_at, auto_renewal
     ) values ($1, $2, 'active', 'monthly', now(), now() + interval '20 days', now() + interval '20 days', true)`,
    [activeOk, basicId],
  );
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [
    activeOk,
    basicId,
  ]);
  await client.query(`select public.run_subscription_lifecycle_enforcement_v1(50)`);
  assert.equal((await subStatus(activeOk)).status, "active");
  assert.equal(await commerciallyExpired(activeOk), false);
  assert.equal(await feature(activeOk, commercialCode), true);
  console.log("  ✓ TEST 1 active before period end remains active + entitled");

  // TEST 2 — active after period end fail-closes immediately; enforcement moves to past_due
  const activeDue = await makeCompany("active-due");
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle,
       current_period_start, current_period_end, next_renewal_at, auto_renewal
     ) values ($1, $2, 'active', 'monthly', now() - interval '40 days', now() - interval '1 day', now() - interval '1 day', true)`,
    [activeDue, basicId],
  );
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [
    activeDue,
    basicId,
  ]);
  await client.query(
    `select public.set_company_feature_grant($1, $2, true, 'contract', now(), null, 'p313-contract')`,
    [activeDue, commercialCode],
  );
  assert.equal(await commerciallyExpired(activeDue), true);
  assert.equal((await subStatus(activeDue)).status, "active");
  await client.query(`select public.run_subscription_lifecycle_enforcement_v1(50)`);
  assert.equal((await subStatus(activeDue)).status, "past_due");
  assert.equal(await commerciallyExpired(activeDue), false);
  assert.equal(await grantActive(activeDue, commercialCode, "contract"), true);
  console.log("  ✓ TEST 2 overdue active is not indefinitely active; enforcement → past_due");

  // TEST 3 / 4 — trial before/after end
  const trialOk = await makeCompany("trial-ok", "approved", "Trial");
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle, trial_ends_at,
       current_period_start, current_period_end, auto_renewal
     ) values ($1, $2, 'trialing', 'monthly', now() + interval '7 days', now(), now() + interval '7 days', true)`,
    [trialOk, basicId],
  );
  await client.query(
    `select public.set_company_feature_grant($1, $2, true, 'trial', now(), now() + interval '7 days', 'p313-trial')`,
    [trialOk, commercialCode],
  );
  await client.query(`select public.run_subscription_lifecycle_enforcement_v1(50)`);
  assert.equal((await subStatus(trialOk)).status, "trialing");
  assert.equal(await commerciallyExpired(trialOk), false);
  assert.equal(await feature(trialOk, commercialCode), true);
  console.log("  ✓ TEST 3 trial before end remains entitled");

  const trialDue = await makeCompany("trial-due", "approved", "Trial");
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle, trial_ends_at,
       current_period_start, current_period_end, auto_renewal
     ) values ($1, $2, 'trialing', 'monthly', now() - interval '1 hour', now() - interval '14 days', now() - interval '1 hour', true)`,
    [trialDue, basicId],
  );
  await client.query(
    `select public.set_company_feature_grant($1, $2, true, 'trial', now() - interval '14 days', now() + interval '30 days', 'p313-trial-due')`,
    [trialDue, commercialCode],
  );
  await client.query(
    `select public.set_company_feature_grant($1, $2, true, 'manual', now(), null, 'p313-manual')`,
    [trialDue, commercialCode],
  );
  assert.equal(await commerciallyExpired(trialDue), true);
  await client.query(`select public.run_subscription_lifecycle_enforcement_v1(50)`);
  assert.equal((await subStatus(trialDue)).status, "grace_period");
  assert.equal(await grantActive(trialDue, commercialCode, "manual"), true);
  console.log("  ✓ TEST 4 trial after end expires per policy; manual preserved");

  // TEST 5 — past_due remains commercially entitled (existing grace policy)
  assert.equal((await subStatus(activeDue)).status, "past_due");
  assert.equal(await commerciallyExpired(activeDue), false);
  assert.equal(await feature(activeDue, commercialCode), true);
  console.log("  ✓ TEST 5 past_due remains entitled per existing policy");

  // TEST 6 / 7 — grace via authoritative renewal-failure RPC, then expire
  await client.query(
    `select public.record_subscription_renewal_failure_v1($1, 'p313 unpaid past_due')`,
    [activeDue],
  );
  assert.equal((await subStatus(activeDue)).status, "grace_period");
  assert.ok((await subStatus(activeDue)).grace_period_ends_at);
  assert.equal(await commerciallyExpired(activeDue), false);
  assert.equal(await feature(activeDue, commercialCode), true);
  console.log("  ✓ TEST 6 grace before end remains entitled");

  await client.query(
    `update public.company_subscriptions
     set grace_period_ends_at = now() - interval '1 minute'
     where company_id = $1`,
    [activeDue],
  );
  await client.query(`select public.enforce_grace_period_expirations_v1(500)`);
  assert.equal((await subStatus(activeDue)).status, "expired", "grace due should expire");
  assert.equal(await feature(activeDue, commercialCode), false, "expired/suspended denies commercial");
  assert.equal(
    await grantActive(activeDue, "bookings", "package"),
    true,
    "unrelated package grants must remain after expire",
  );
  assert.equal(
    await grantActive(activeDue, commercialCode, "contract"),
    true,
    "contract grant row must remain after expire",
  );
  console.log("  ✓ TEST 7 grace after end expires; package/contract grant rows preserved");

  // TEST 8 — suspended stays suspended
  const sus = await makeCompany("sus", "approved", "Suspended");
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle, trial_ends_at,
       current_period_start, current_period_end, auto_renewal
     ) values ($1, $2, 'trialing', 'monthly', now() - interval '1 hour', now() - interval '14 days', now() - interval '1 hour', true)`,
    [sus, basicId],
  );
  await client.query(`select public.run_subscription_lifecycle_enforcement_v1(50)`);
  const susCo = await client.query(`select status from public.companies where id = $1`, [sus]);
  assert.equal(susCo.rows[0].status, "Suspended");
  assert.equal(await feature(sus, commercialCode), false);
  console.log("  ✓ TEST 8 suspended remains suspended; commercial denied");

  // TEST 9 — rerun is idempotent
  const before = await subStatus(activeDue);
  await client.query(`select public.run_subscription_lifecycle_enforcement_v1(50)`);
  const after = await subStatus(activeDue);
  assert.equal(after.status, before.status);
  console.log("  ✓ TEST 9 rerun does not corrupt state");

  // TEST 12 — bounded batch
  const r = await client.query(`select public.run_subscription_lifecycle_enforcement_v1(2) as r`);
  assert.equal(r.rows[0].r.ok, true);
  assert.equal(Number(r.rows[0].r.limit), 2);
  const capped = await client.query(
    `select public.run_subscription_lifecycle_enforcement_v1(9999) as r`,
  );
  assert.equal(Number(capped.rows[0].r.limit), 500);
  console.log("  ✓ TEST 12 batch limit is bounded");

  await client.query("rollback");
  console.log("\n313 verification passed (transaction rolled back)\n");
} catch (err) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  console.error("\n313 verification failed:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
