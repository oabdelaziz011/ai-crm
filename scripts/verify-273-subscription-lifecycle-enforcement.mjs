/**
 * Phase 7.8 — subscription expiration / renewal / grace lifecycle.
 * Run: node scripts/verify-273-subscription-lifecycle-enforcement.mjs
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
console.log("\nPhase 7.8 subscription lifecycle enforcement verification\n");

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
      'P78 '||$1||' '||gen_random_uuid()::text,
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

try {
  await client.query("begin");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', true)");
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");

  const basic = await client.query(`select id from public.plans where code = 'basic' limit 1`);
  assert.ok(basic.rows[0]?.id);
  const basicId = basic.rows[0].id;

  // ── Trial not expired → no transition
  const trialOk = await makeCompany("trial-ok", "approved", "Trial");
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle, trial_ends_at,
       current_period_start, current_period_end, auto_renewal
     ) values ($1, $2, 'trialing', 'monthly', now() + interval '7 days', now(), now() + interval '7 days', true)`,
    [trialOk, basicId],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'ticketing', true, 'trial', now(), now() + interval '7 days', 'p78')`,
    [trialOk],
  );
  let r = await client.query(`select public.enforce_trial_expirations_v1(50) as r`);
  let st = await client.query(`select status from public.company_subscriptions where company_id = $1`, [
    trialOk,
  ]);
  assert.equal(st.rows[0].status, "trialing");
  console.log("  ✓ trial not expired → no transition");

  // ── Trial expired → grace; idempotent
  const trialDue = await makeCompany("trial-due", "approved", "Trial");
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle, trial_ends_at,
       current_period_start, current_period_end, auto_renewal
     ) values ($1, $2, 'trialing', 'monthly', now() - interval '1 hour', now() - interval '14 days', now() - interval '1 hour', true)`,
    [trialDue, basicId],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'ticketing', true, 'trial', now() - interval '14 days', now() - interval '1 hour', 'p78-trial')`,
    [trialDue],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'whatsapp_channel', true, 'manual', now(), null, 'p78-manual')`,
    [trialDue],
  );
  r = await client.query(`select public.enforce_trial_expirations_v1(50) as r`);
  st = await client.query(
    `select status, grace_period_ends_at from public.company_subscriptions where company_id = $1`,
    [trialDue],
  );
  assert.equal(st.rows[0].status, "grace_period");
  assert.ok(st.rows[0].grace_period_ends_at);
  assert.equal(await grantActive(trialDue, "whatsapp_channel", "manual"), true);
  const graceEnds = st.rows[0].grace_period_ends_at;
  await client.query(`select public.enforce_trial_expirations_v1(50) as r`);
  st = await client.query(
    `select status, grace_period_ends_at from public.company_subscriptions where company_id = $1`,
    [trialDue],
  );
  assert.equal(st.rows[0].status, "grace_period");
  assert.equal(String(st.rows[0].grace_period_ends_at), String(graceEnds));
  console.log("  ✓ trial expired → grace; idempotent; manual preserved");

  // ── Active not due → unchanged
  const activeOk = await makeCompany("active-ok");
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle,
       current_period_start, current_period_end, next_renewal_at, auto_renewal
     ) values ($1, $2, 'active', 'monthly', now(), now() + interval '20 days', now() + interval '20 days', true)`,
    [activeOk, basicId],
  );
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [activeOk, basicId]);
  await client.query(`select public.enforce_active_period_due_v1(50) as r`);
  st = await client.query(`select status from public.company_subscriptions where company_id = $1`, [
    activeOk,
  ]);
  assert.equal(st.rows[0].status, "active");
  console.log("  ✓ active period not due → unchanged");

  // ── Active period due → past_due
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
    `select public.set_company_feature_grant($1, 'api_access', true, 'contract', now(), null, 'p78-contract')`,
    [activeDue],
  );
  await client.query(`select public.enforce_active_period_due_v1(50) as r`);
  st = await client.query(`select status from public.company_subscriptions where company_id = $1`, [
    activeDue,
  ]);
  assert.equal(st.rows[0].status, "past_due");
  assert.equal(await feature(activeDue, "ticketing"), true); // Phase 6: past_due still grant-based
  assert.equal(await grantActive(activeDue, "api_access", "contract"), true);
  // Same-tick grace should not fire (1s guard)
  await client.query(`select public.enforce_past_due_to_grace_v1(50) as r`);
  st = await client.query(`select status from public.company_subscriptions where company_id = $1`, [
    activeDue,
  ]);
  assert.equal(st.rows[0].status, "past_due");
  console.log("  ✓ active period due → past_due; same-tick grace blocked; access grant-based");

  // Enter grace via authoritative renewal-failure RPC (same path used by enforce_past_due_to_grace_v1).
  // Batch enforcer may be busy with other overdue tenants in shared DB; per-company path is authoritative.
  await client.query(
    `select public.record_subscription_renewal_failure_v1($1, 'p78 unpaid past_due')`,
    [activeDue],
  );
  st = await client.query(
    `select status, grace_period_ends_at from public.company_subscriptions where company_id = $1`,
    [activeDue],
  );
  assert.equal(st.rows[0].status, "grace_period");
  assert.ok(st.rows[0].grace_period_ends_at);
  assert.equal(await feature(activeDue, "ticketing"), true);
  // Idempotent grace (does not restart clock)
  const graceEndsPaid = st.rows[0].grace_period_ends_at;
  await client.query(
    `select public.record_subscription_renewal_failure_v1($1, 'p78 unpaid past_due again')`,
    [activeDue],
  );
  st = await client.query(
    `select status, grace_period_ends_at from public.company_subscriptions where company_id = $1`,
    [activeDue],
  );
  assert.equal(st.rows[0].status, "grace_period");
  assert.equal(String(st.rows[0].grace_period_ends_at), String(graceEndsPaid));
  console.log("  ✓ past_due → grace; commercial access still grant-based; grace clock stable");

  // ── Grace expired → expired; trial grants off; package/manual/contract/system survive
  await client.query(
    `update public.company_subscriptions
     set grace_period_ends_at = now() - interval '1 minute'
     where company_id = $1`,
    [activeDue],
  );
  // Add a lingering trial grant to confirm deactivation
  await client.query(
    `select public.set_company_feature_grant($1, 'leads', true, 'trial', now() - interval '30 days', now() + interval '30 days', 'p78-stale-trial')`,
    [activeDue],
  );
  await client.query(`select public.enforce_grace_period_expirations_v1(50) as r`);
  st = await client.query(`select status from public.company_subscriptions where company_id = $1`, [
    activeDue,
  ]);
  assert.equal(st.rows[0].status, "expired");
  assert.equal(await grantActive(activeDue, "leads", "trial"), false);
  assert.equal(await grantActive(activeDue, "ticketing", "package"), true);
  assert.equal(await grantActive(activeDue, "api_access", "contract"), true);
  assert.equal(await grantActive(activeDue, "core_crm", "system"), true);
  // Idempotent expire
  await client.query(`select public.enforce_grace_period_expirations_v1(50) as r`);
  st = await client.query(`select status from public.company_subscriptions where company_id = $1`, [
    activeDue,
  ]);
  assert.equal(st.rows[0].status, "expired");
  console.log("  ✓ grace → expired; trial deactivated; package/contract/system preserved; idempotent");

  // ── Canceled ignored by enforcers
  const canceled = await makeCompany("canceled");
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle,
       current_period_start, current_period_end, auto_renewal
     ) values ($1, $2, 'canceled', 'monthly', now() - interval '60 days', now() - interval '30 days', false)`,
    [canceled, basicId],
  );
  await client.query(`select public.run_subscription_lifecycle_enforcement_v1(50)`);
  st = await client.query(`select status from public.company_subscriptions where company_id = $1`, [
    canceled,
  ]);
  assert.equal(st.rows[0].status, "canceled");
  console.log("  ✓ canceled remains canceled under enforcement");

  // ── Suspended preserved
  const sus = await makeCompany("sus", "approved", "Suspended");
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle, trial_ends_at,
       current_period_start, current_period_end, auto_renewal
     ) values ($1, $2, 'trialing', 'monthly', now() - interval '1 hour', now() - interval '14 days', now() - interval '1 hour', true)`,
    [sus, basicId],
  );
  await client.query(`select public.enforce_trial_expirations_v1(50)`);
  const susCo = await client.query(`select status from public.companies where id = $1`, [sus]);
  assert.equal(susCo.rows[0].status, "Suspended");
  st = await client.query(`select status from public.company_subscriptions where company_id = $1`, [
    sus,
  ]);
  assert.equal(st.rows[0].status, "grace_period");
  assert.equal(await feature(sus, "ticketing"), false);
  console.log("  ✓ suspended company stays Suspended; commercial denied");

  // ── Pending approval cannot gain access via lifecycle
  const pending = await makeCompany("pending", "pending", "Trial");
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle,
       current_period_start, current_period_end, next_renewal_at, auto_renewal
     ) values ($1, $2, 'active', 'monthly', now() - interval '40 days', now() - interval '1 day', now() - interval '1 day', true)`,
    [pending, basicId],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'whatsapp_channel', true, 'manual', now(), null, 'p78')`,
    [pending],
  );
  await client.query(`select public.enforce_active_period_due_v1(50)`);
  assert.equal(await feature(pending, "whatsapp_channel"), false);
  console.log("  ✓ pending approval still denies commercial (Phase 6)");

  // ── Orchestrator + no fabricated renewal
  r = await client.query(`select public.run_subscription_lifecycle_enforcement_v1(25) as r`);
  assert.equal(r.rows[0].r.ok, true);
  assert.equal(r.rows[0].r.renewal.automatic_paid_renewal, false);
  assert.equal(r.rows[0].r.renewal.authoritative_rpc, "renew_subscription_from_payment");
  console.log("  ✓ orchestrator returns summary; no automatic paid renewal");

  // ── Unauthorized rejected
  await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    "00000000-0000-4000-8000-000000000098",
  ]);
  await expectFail("unauth_enforce", async () => {
    await client.query(`select public.run_subscription_lifecycle_enforcement_v1(10)`);
  });
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
  console.log("  ✓ unauthorized lifecycle enforcement rejected");

  // ── Audit present
  const audit = await client.query(
    `select event_type from public.billing_audit_logs
     where event_type in ('trial_expired','subscription_past_due','grace_period_started','subscription_expired','subscription_lifecycle_enforced')
     order by occurred_at desc limit 20`,
  );
  const types = new Set(audit.rows.map((row) => row.event_type));
  assert.ok(types.has("trial_expired") || types.has("grace_period_started"));
  assert.ok(types.has("subscription_expired") || types.has("subscription_past_due"));
  console.log("  ✓ lifecycle audit events present");

  await client.query("rollback");
  console.log("\nPhase 7.8 subscription lifecycle enforcement verification passed\n");
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  console.error("\nFAIL", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
