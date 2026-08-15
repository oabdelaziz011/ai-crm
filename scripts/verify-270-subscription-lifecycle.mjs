/**
 * Phase 7.5 — subscription lifecycle hardening.
 * Run: node scripts/verify-270-subscription-lifecycle.mjs
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
console.log("\nPhase 7.5 subscription lifecycle verification\n");

async function feature(companyId, code) {
  const r = await client.query(`select public.is_feature_enabled($1, $2) as e`, [companyId, code]);
  return Boolean(r.rows[0].e);
}

try {
  await client.query("begin");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', true)");
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");

  // Integrity
  const integrity = await client.query(
    `select public.verify_subscription_lifecycle_integrity_v1() as r`,
  );
  assert.equal(integrity.rows[0].r.ok, true, JSON.stringify(integrity.rows[0].r));
  console.log("  ✓ subscription lifecycle integrity");

  // Transition helper
  await client.query(`select public.assert_subscription_status_transition('active', 'grace_period')`);
  await client.query(`select public.assert_subscription_status_transition('grace_period', 'expired')`);
  await client.query(`select public.assert_subscription_status_transition('expired', 'active')`);
  await client.query("savepoint bad_transition");
  let bad = false;
  try {
    await client.query(`select public.assert_subscription_status_transition('canceled', 'grace_period')`);
  } catch {
    bad = true;
    await client.query("rollback to savepoint bad_transition");
  }
  assert.equal(bad, true);
  console.log("  ✓ transition matrix allows legal / rejects illegal");

  const pack = await client.query(`
    select public.upsert_commercial_package_v1(
      'life_p75', 'Life P75', null, 'Life P75', 'lifecycle pack',
      40, 400, true, false, true, 40, 1,
      '{}'::jsonb, null, null, null, null, 'fixed'
    ) as r
  `);
  const packId = pack.rows[0].r.id;
  await client.query(`select public.set_commercial_package_features_v1($1, $2)`, [
    packId,
    ["core_crm", "customers", "leads", "bookings"],
  ]);

  const co = await client.query(`
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'P75 Life '||gen_random_uuid()::text,
      'Active', 'Pro', 'active', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `);
  const companyId = co.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [companyId]);

  // One subscription per company — create via assign
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [
    companyId,
    packId,
  ]);
  const dup = await client.query(
    `select count(*)::int as n from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  assert.equal(dup.rows[0].n, 1);

  // Assign twice is idempotent for row count
  await client.query(`select public.assign_company_package_v1($1, $2, 'yearly')`, [
    companyId,
    packId,
  ]);
  const cycle = await client.query(
    `select billing_cycle, status, plan_id from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  assert.equal(cycle.rows[0].billing_cycle, "yearly");
  assert.equal(cycle.rows[0].plan_id, packId);
  assert.equal(await feature(companyId, "leads"), true);
  console.log("  ✓ one subscription/company + cycle change via package assign");

  // Manual/contract survive
  await client.query(
    `select public.set_company_feature_grant($1, 'whatsapp_channel', true, 'manual', now(), null, 'p75')`,
    [companyId],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'api_access', true, 'contract', now(), null, 'p75')`,
    [companyId],
  );

  // Suspend preserves operational Suspended across sync (package re-assign sync)
  await client.query(`update public.companies set status = 'Suspended' where id = $1`, [companyId]);
  await client.query(`select public.sync_company_subscription_denormalized($1)`, [companyId]);
  const sus = await client.query(`select status from public.companies where id = $1`, [companyId]);
  assert.equal(sus.rows[0].status, "Suspended");
  assert.equal(await feature(companyId, "leads"), false);
  assert.equal(await feature(companyId, "core_crm"), true);
  console.log("  ✓ suspended company stays suspended after sync; commercial denied");

  // Restore rematerializes Active without inventing grants
  await client.query(`select public.restore_billing_subscription($1, 'p75 restore')`, [companyId]);
  const restored = await client.query(`select status from public.companies where id = $1`, [
    companyId,
  ]);
  assert.equal(restored.rows[0].status, "Active");
  assert.equal(await feature(companyId, "leads"), true);
  assert.equal(await feature(companyId, "whatsapp_channel"), true);
  assert.equal(await feature(companyId, "api_access"), true);
  console.log("  ✓ restore clears Suspended; grants intact");

  // Past due + grace
  await client.query(`select public.mark_subscription_past_due_v1($1, 'p75 overdue')`, [companyId]);
  let st = await client.query(
    `select status from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  assert.equal(st.rows[0].status, "past_due");
  assert.equal(await feature(companyId, "leads"), true); // Phase 6: past_due still entitled if grants

  await client.query(`select public.record_subscription_renewal_failure_v1($1, 'p75 fail')`, [
    companyId,
  ]);
  st = await client.query(
    `select status, grace_period_ends_at from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  assert.equal(st.rows[0].status, "grace_period");
  assert.ok(st.rows[0].grace_period_ends_at);
  assert.equal(await feature(companyId, "leads"), true);
  console.log("  ✓ past_due → grace_period; commercial access still grant-based");

  // Force grace end → expired
  await client.query(
    `update public.company_subscriptions
     set grace_period_ends_at = now() - interval '1 minute'
     where company_id = $1`,
    [companyId],
  );
  await client.query(`select public.enforce_grace_period_expirations_v1()`);
  st = await client.query(
    `select status from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  assert.equal(st.rows[0].status, "expired");
  console.log("  ✓ grace → expired via enforce");

  // Cancel idempotent on expired? expired → canceled is legal
  await client.query(`select public.cancel_company_subscription_v1($1, 'p75 cancel', false)`, [
    companyId,
  ]);
  st = await client.query(
    `select status, auto_renewal, canceled_at from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  assert.equal(st.rows[0].status, "canceled");
  assert.equal(st.rows[0].auto_renewal, false);
  assert.ok(st.rows[0].canceled_at);

  const cancelAgain = await client.query(
    `select public.cancel_company_subscription_v1($1, 'again', false) as r`,
    [companyId],
  );
  assert.equal(cancelAgain.rows[0].r.skipped, true);
  console.log("  ✓ cancel + idempotent re-cancel");

  // Trial extend path: create new company trialing
  const co2 = await client.query(`
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'P75 Trial '||gen_random_uuid()::text,
      'Trial', 'Basic', 'trialing', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `);
  const trialCompany = co2.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [trialCompany]);
  const trialEnds = new Date(Date.now() + 14 * 86400000).toISOString();
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle, trial_ends_at,
       current_period_start, current_period_end, auto_renewal
     ) values ($1, $2, 'trialing', 'monthly', $3, now(), $3, true)`,
    [trialCompany, packId, trialEnds],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'ticketing', true, 'trial', now(), $2::timestamptz, 'p75-trial')`,
    [trialCompany, trialEnds],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'whatsapp_channel', true, 'manual', now(), null, 'p75-m')`,
    [trialCompany],
  );

  const extended = new Date(Date.now() + 21 * 86400000).toISOString();
  await client.query(`select public.extend_company_trial_v1($1, $2::timestamptz)`, [
    trialCompany,
    extended,
  ]);
  const trialRow = await client.query(
    `select status, trial_ends_at from public.company_subscriptions where company_id = $1`,
    [trialCompany],
  );
  assert.equal(trialRow.rows[0].status, "trialing");
  assert.ok(new Date(trialRow.rows[0].trial_ends_at).getTime() >= new Date(extended).getTime() - 1000);

  const trialGrant = await client.query(
    `select expires_at from public.company_feature_overrides
     where company_id = $1 and feature_code = 'ticketing' and source = 'trial' and is_active`,
    [trialCompany],
  );
  assert.ok(new Date(trialGrant.rows[0].expires_at).getTime() >= new Date(extended).getTime() - 1000);
  assert.equal(await feature(trialCompany, "whatsapp_channel"), true);
  console.log("  ✓ trial extend updates trial_ends_at + trial grants; manual survives");

  // Pending still denies commercial
  await client.query(`update public.companies set approval_status = 'pending' where id = $1`, [
    trialCompany,
  ]);
  assert.equal(await feature(trialCompany, "ticketing"), false);
  assert.equal(await feature(trialCompany, "core_crm"), true);
  console.log("  ✓ pending approval still denies commercial (Phase 6)");

  // Price change does not mutate grants (regression)
  await client.query(`update public.companies set approval_status = 'approved' where id = $1`, [
    trialCompany,
  ]);
  await client.query(`
    select public.upsert_commercial_package_v1(
      'life_p75', 'Life P75', $1, 'Life P75', 'lifecycle pack',
      55, 500, true, false, true, 40, 1,
      '{}'::jsonb, null, null, null, null, 'fixed'
    )
  `, [packId]);
  assert.equal(await feature(trialCompany, "whatsapp_channel"), true);
  console.log("  ✓ package list price change does not mutate grants");

  await client.query("rollback");
  console.log("\nPhase 7.5 subscription lifecycle verification passed\n");
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
