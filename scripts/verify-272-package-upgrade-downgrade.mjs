/**
 * Phase 7.7 — package upgrade / downgrade + grant synchronization.
 * Run: node scripts/verify-272-package-upgrade-downgrade.mjs
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
console.log("\nPhase 7.7 package upgrade/downgrade verification\n");

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

async function makeActiveCompany(suffix, planId) {
  const co = await client.query(
    `
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'P77 '||$1||' '||gen_random_uuid()::text,
      'Active', 'Basic', 'active', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `,
    [suffix],
  );
  const companyId = co.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [companyId]);
  const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle,
       current_period_start, current_period_end, next_renewal_at, auto_renewal
     ) values ($1, $2, 'active', 'monthly', now(), $3::timestamptz, $3::timestamptz, true)`,
    [companyId, planId, periodEnd],
  );
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [companyId, planId]);
  return { companyId, periodEnd };
}

try {
  await client.query("begin");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', true)");
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");

  const basic = await client.query(`select id, tier_rank from public.plans where code = 'basic' limit 1`);
  const pro = await client.query(`select id, tier_rank from public.plans where code = 'pro' limit 1`);
  const enterprise = await client.query(
    `select id, tier_rank from public.plans where code = 'enterprise' limit 1`,
  );
  assert.ok(basic.rows[0]?.id && pro.rows[0]?.id && enterprise.rows[0]?.id);
  const basicId = basic.rows[0].id;
  const proId = pro.rows[0].id;
  const enterpriseId = enterprise.rows[0].id;

  // Ensure tier ranks for direction detection
  await client.query(`
    update public.plans set tier_rank = 10 where code = 'basic';
    update public.plans set tier_rank = 20 where code = 'pro';
    update public.plans set tier_rank = 30 where code = 'enterprise';
  `);

  // ── 1–2 Basic → Pro (upgrade) with manual/contract/system
  const { companyId, periodEnd } = await makeActiveCompany("up", basicId);
  await client.query(
    `select public.set_company_feature_grant($1, 'whatsapp_channel', true, 'manual', now(), null, 'p77-manual')`,
    [companyId],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'api_access', true, 'contract', now(), null, 'p77-contract')`,
    [companyId],
  );

  const before = await client.query(
    `select status, billing_cycle, current_period_end, next_renewal_at, plan_id
     from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  assert.equal(before.rows[0].status, "active");
  assert.equal(before.rows[0].billing_cycle, "monthly");

  const up = await client.query(
    `select public.change_company_package_v1($1, $2, 'p77 upgrade basic→pro') as r`,
    [companyId, proId],
  );
  assert.equal(up.rows[0].r.skipped, false);
  assert.equal(up.rows[0].r.direction, "upgrade");
  assert.equal(up.rows[0].r.package_code, "pro");
  assert.equal(up.rows[0].r.billing_cycle, "monthly");
  assert.equal(up.rows[0].r.status, "active");

  const afterUp = await client.query(
    `select cs.status, cs.billing_cycle, cs.current_period_end, cs.next_renewal_at, cs.plan_id,
            cs.package_feature_snapshot, companies.subscription_plan
     from public.company_subscriptions cs
     join public.companies on companies.id = cs.company_id
     where cs.company_id = $1`,
    [companyId],
  );
  assert.equal(afterUp.rows[0].status, "active");
  assert.equal(afterUp.rows[0].billing_cycle, "monthly");
  assert.equal(afterUp.rows[0].plan_id, proId);
  assert.ok(
    String(afterUp.rows[0].current_period_end) === String(before.rows[0].current_period_end) ||
      new Date(afterUp.rows[0].current_period_end).getTime() === new Date(periodEnd).getTime(),
    "period end preserved",
  );
  assert.ok(Array.isArray(afterUp.rows[0].package_feature_snapshot));
  assert.ok(afterUp.rows[0].package_feature_snapshot.includes("leads"));
  assert.equal(await grantActive(companyId, "leads", "package"), true);
  assert.equal(await grantActive(companyId, "whatsapp_channel", "manual"), true);
  assert.equal(await grantActive(companyId, "api_access", "contract"), true);
  assert.equal(await feature(companyId, "leads"), true);
  assert.equal(await feature(companyId, "whatsapp_channel"), true);
  assert.equal(await feature(companyId, "api_access"), true);
  console.log("  ✓ Basic → Pro: upgrade, dates/cycle preserved, package+manual+contract OK");

  // ── Same package noop
  const noop = await client.query(
    `select public.change_company_package_v1($1, $2, 'noop') as r`,
    [companyId, proId],
  );
  assert.equal(noop.rows[0].r.skipped, true);
  assert.equal(noop.rows[0].r.reason, "already_on_target_package");
  console.log("  ✓ same package → no-op");

  // ── Pro → Basic downgrade; advanced package features revoked; manual/contract survive
  const down = await client.query(
    `select public.change_company_package_v1($1, $2, 'p77 downgrade pro→basic') as r`,
    [companyId, basicId],
  );
  assert.equal(down.rows[0].r.direction, "downgrade");
  assert.equal(down.rows[0].r.package_code, "basic");
  assert.equal(await grantActive(companyId, "leads", "package"), false);
  assert.equal(await grantActive(companyId, "ticketing", "package"), true);
  assert.equal(await grantActive(companyId, "whatsapp_channel", "manual"), true);
  assert.equal(await grantActive(companyId, "api_access", "contract"), true);
  assert.equal(await feature(companyId, "leads"), false);
  assert.equal(await feature(companyId, "whatsapp_channel"), true);
  assert.equal(await feature(companyId, "api_access"), true);
  console.log("  ✓ Pro → Basic: package revoke only; manual/contract preserved");

  // ── Basic → Enterprise then Enterprise → Basic
  const upEnt = await client.query(
    `select public.change_company_package_v1($1, $2, 'to enterprise') as r`,
    [companyId, enterpriseId],
  );
  assert.equal(upEnt.rows[0].r.direction, "upgrade");
  assert.equal(await feature(companyId, "workflow_automation"), true);
  const downEnt = await client.query(
    `select public.change_company_package_v1($1, $2, 'from enterprise') as r`,
    [companyId, basicId],
  );
  assert.equal(downEnt.rows[0].r.direction, "downgrade");
  assert.equal(await grantActive(companyId, "workflow_automation", "package"), false);
  assert.equal(await feature(companyId, "whatsapp_channel"), true);
  console.log("  ✓ Basic ↔ Enterprise upgrade/downgrade");

  // ── Audit events
  const audit = await client.query(
    `select event_type from public.billing_audit_logs
     where company_id = $1 and event_type in ('package_upgraded','package_downgraded','package_changed')
     order by occurred_at desc limit 10`,
    [companyId],
  );
  const types = audit.rows.map((r) => r.event_type);
  assert.ok(types.includes("package_upgraded"));
  assert.ok(types.includes("package_downgraded"));
  console.log("  ✓ package_upgraded / package_downgraded audit written");

  // ── Trialing rejected (not Trial→Paid)
  const trialCo = await client.query(`
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'P77 trial '||gen_random_uuid()::text,
      'Trial', 'Basic', 'trialing', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `);
  const trialId = trialCo.rows[0].id;
  await client.query(
    `insert into public.company_subscriptions (
       company_id, plan_id, status, billing_cycle, trial_ends_at,
       current_period_start, current_period_end, auto_renewal
     ) values ($1, $2, 'trialing', 'monthly', now() + interval '14 days', now(), now() + interval '14 days', true)`,
    [trialId, basicId],
  );
  await expectFail("trial_change", async () => {
    await client.query(`select public.change_company_package_v1($1, $2, 'bad')`, [trialId, proId]);
  });
  console.log("  ✓ trialing package change rejected (use convert_trial_to_paid_v1)");

  // ── Expired / canceled rejected
  const expCo = await makeActiveCompany("exp", basicId);
  await client.query(
    `update public.company_subscriptions set status = 'expired' where company_id = $1`,
    [expCo.companyId],
  );
  await expectFail("expired_change", async () => {
    await client.query(`select public.change_company_package_v1($1, $2, 'bad')`, [
      expCo.companyId,
      proId,
    ]);
  });

  const canCo = await makeActiveCompany("can", basicId);
  await client.query(
    `update public.company_subscriptions set status = 'canceled' where company_id = $1`,
    [canCo.companyId],
  );
  await expectFail("canceled_change", async () => {
    await client.query(`select public.change_company_package_v1($1, $2, 'bad')`, [
      canCo.companyId,
      proId,
    ]);
  });
  console.log("  ✓ expired/canceled package change rejected");

  // ── Inactive package rejected
  const inactive = await client.query(`
    select public.upsert_commercial_package_v1(
      'p77_inactive', 'P77 Inactive', null, 'P77 Inactive', 'inactive pkg',
      10, 100, false, false, true, 92, 5,
      '{}'::jsonb, null, null, null, null, 'fixed'
    ) as r
  `);
  const inactiveId = inactive.rows[0].r.id;
  await expectFail("inactive_pkg", async () => {
    await client.query(`select public.change_company_package_v1($1, $2, 'bad')`, [
      companyId,
      inactiveId,
    ]);
  });
  console.log("  ✓ inactive target package rejected");

  // ── Suspended company: package changes, Suspended preserved, commercial denied
  const sus = await makeActiveCompany("sus", basicId);
  await client.query(`update public.companies set status = 'Suspended' where id = $1`, [sus.companyId]);
  await client.query(`select public.change_company_package_v1($1, $2, 'suspended upgrade')`, [
    sus.companyId,
    proId,
  ]);
  const susCo = await client.query(`select status from public.companies where id = $1`, [sus.companyId]);
  assert.equal(susCo.rows[0].status, "Suspended");
  const susSub = await client.query(
    `select plan_id, status from public.company_subscriptions where company_id = $1`,
    [sus.companyId],
  );
  assert.equal(susSub.rows[0].plan_id, proId);
  assert.equal(susSub.rows[0].status, "active");
  assert.equal(await feature(sus.companyId, "leads"), false);
  console.log("  ✓ suspended company: package changes, Suspended preserved, commercial denied");

  // ── System grants survive
  assert.equal(await grantActive(companyId, "core_crm", "system"), true);
  console.log("  ✓ system grants survive package change");

  // ── No duplicate active package grants for same feature
  const dup = await client.query(
    `select feature_code, count(*)::int as c
     from public.company_feature_overrides
     where company_id = $1 and source = 'package' and is_active = true
     group by feature_code having count(*) > 1`,
    [companyId],
  );
  assert.equal(dup.rows.length, 0);
  console.log("  ✓ no duplicate active package grants");

  // ── Unauthorized actor rejected
  await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    "00000000-0000-4000-8000-000000000099",
  ]);
  await expectFail("unauth_change", async () => {
    await client.query(`select public.change_company_package_v1($1, $2, 'bad')`, [companyId, proId]);
  });
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
  console.log("  ✓ unauthorized actor rejected");

  await client.query("rollback");
  console.log("\nPhase 7.7 package upgrade/downgrade verification passed\n");
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
