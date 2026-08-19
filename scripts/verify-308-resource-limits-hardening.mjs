/**
 * Task 7C-FIX — occupancy contract, ensure-on-GET, reserve auth.
 * Run: node scripts/verify-308-resource-limits-hardening.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
console.log("\nTask 7C-FIX resource-limit hardening verification\n");

async function expectFail(label, fn, pattern) {
  await client.query(`savepoint ${label}`);
  let failed = false;
  try {
    await fn();
  } catch (error) {
    failed = true;
    await client.query(`rollback to savepoint ${label}`);
    assert.match(String(error?.message ?? error), pattern, label);
  }
  assert.equal(failed, true, `expected failure: ${label}`);
}

async function occupancy(companyId) {
  const r = await client.query(`select public.get_company_resource_occupancy_v1($1) as o`, [companyId]);
  return r.rows[0].o;
}

async function makeCompany(suffix) {
  const co = await client.query(
    `
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'RL308 '||$1||' '||gen_random_uuid()::text,
      'Active', 'Basic', 'active', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `,
    [suffix],
  );
  const companyId = co.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [companyId]);
  if (
    (await client.query(`select to_regprocedure('public._ensure_company_subscription_row(uuid)') is not null as ok`))
      .rows[0].ok
  ) {
    await client.query(`select public._ensure_company_subscription_row($1)`, [companyId]);
  }
  return companyId;
}

try {
  await client.query("begin");
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");

  const sql308 = readFileSync(new URL("../supabase/migrations/308_resource_limits_hardening.sql", import.meta.url), "utf8");
  assert.match(sql308, /effective_used/);
  assert.match(sql308, /_ensure_company_resource_limits/);
  assert.match(sql308, /user_has_permission_in_company/);
  assert.match(sql308, /users\.edit/);
  assert.doesNotMatch(sql308, /insert into public\.usage_records/);
  console.log("  ✓ 308 migration contract");

  const basic = await client.query(`
    select public.upsert_commercial_package_v1(
      'basic_rl8', 'Basic RL8', null, 'Basic RL8', 'RL8 basic',
      19, 190, true, false, true, 1, 1
    ) as r
  `);
  const basicId = basic.rows[0].r.id ?? basic.rows[0].r.plan_id;
  const pro = await client.query(`
    select public.upsert_commercial_package_v1(
      'pro_rl8', 'Pro RL8', null, 'Pro RL8', 'RL8 pro',
      49, 490, true, false, true, 2, 2
    ) as r
  `);
  const proId = pro.rows[0].r.id ?? pro.rows[0].r.plan_id;
  const ent = await client.query(`
    select public.upsert_commercial_package_v1(
      'enterprise_rl8', 'Enterprise RL8', null, 'Enterprise RL8', 'RL8 enterprise',
      99, 990, true, false, true, 3, 3
    ) as r
  `);
  const entId = ent.rows[0].r.id ?? ent.rows[0].r.plan_id;

  const companyId = await makeCompany("occ");
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [companyId, basicId]);
  let occ = await occupancy(companyId);
  assert.equal(occ.users.max_allowed, 5);
  assert.equal(occ.users.current_count, 0);
  assert.equal(occ.users.pending_reservations, 0);
  assert.equal(occ.users.effective_used, 0);
  assert.equal(occ.users.remaining, 5);
  console.log("  ✓ 1 current=0 pending=0 remaining=5");

  await client.query(`select public.reserve_company_user_seat_v1($1)`, [companyId]);
  await client.query(`select public.reserve_company_user_seat_v1($1)`, [companyId]);
  await client.query(`select public.reserve_company_user_seat_v1($1)`, [companyId]);
  await client.query(`select public.reserve_company_user_seat_v1($1)`, [companyId]);
  occ = await occupancy(companyId);
  assert.equal(occ.users.current_count, 0);
  assert.equal(occ.users.pending_reservations, 4);
  assert.equal(occ.users.effective_used, 4);
  assert.equal(occ.users.remaining, 1);
  console.log("  ✓ pending reservations counted in effective_used");

  await client.query(`select public.reserve_company_user_seat_v1($1)`, [companyId]);
  occ = await occupancy(companyId);
  assert.equal(occ.users.effective_used, 5);
  assert.equal(occ.users.remaining, 0);
  assert.equal(occ.users.is_over_limit, false);
  await expectFail(
    "reserve_full",
    () => client.query(`select public.reserve_company_user_seat_v1($1)`, [companyId]),
    /user_seat_limit_reached/,
  );
  console.log("  ✓ 2/6/7 4+1 pending fills 5; remaining 0; create blocked");

  const expired = await client.query(
    `insert into public.company_user_seat_reservations (company_id, expires_at)
     values ($1, now() - interval '1 minute') returning id`,
    [companyId],
  );
  occ = await occupancy(companyId);
  assert.equal(occ.users.pending_reservations, 5, "expired reservation excluded");
  console.log("  ✓ 3 expired reservation not counted");

  const openRows = await client.query(
    `select id from public.company_user_seat_reservations
     where company_id = $1 and consumed_at is null and released_at is null and expires_at > now()
     order by created_at limit 1`,
    [companyId],
  );
  await client.query(`select public.release_company_user_seat_v1($1)`, [openRows.rows[0].id]);
  occ = await occupancy(companyId);
  assert.equal(occ.users.pending_reservations, 4);
  assert.equal(occ.users.remaining, 1);
  console.log("  ✓ 4 released reservation not counted");

  await client.query(`select public.reserve_company_user_seat_v1($1)`, [companyId]);
  const consumeId = (
    await client.query(
      `select id from public.company_user_seat_reservations
       where company_id = $1 and consumed_at is null and released_at is null and expires_at > now()
       order by created_at desc limit 1`,
      [companyId],
    )
  ).rows[0].id;
  await client.query(
    `update public.company_user_seat_reservations set consumed_at = now() where id = $1`,
    [consumeId],
  );
  occ = await occupancy(companyId);
  assert.equal(occ.users.pending_reservations, 4, "consumed reservation excluded");
  console.log("  ✓ 5 consumed reservation not counted");
  void expired;

  const missingBasic = await makeCompany("missing-basic");
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [missingBasic, basicId]);
  await client.query(`delete from public.company_resource_limits where company_id = $1`, [missingBasic]);
  const beforeRow = await client.query(
    `select 1 from public.company_resource_limits where company_id = $1`,
    [missingBasic],
  );
  assert.equal(beforeRow.rowCount, 0);
  occ = await occupancy(missingBasic);
  assert.equal(occ.users.max_allowed, 5);
  assert.equal(occ.branches.max_allowed, 1);
  assert.notEqual(occ.users.max_allowed, null);
  const afterRow = await client.query(
    `select max_users, max_branches, source from public.company_resource_limits where company_id = $1`,
    [missingBasic],
  );
  assert.equal(afterRow.rows[0].max_users, 5);
  assert.equal(afterRow.rows[0].max_branches, 1);
  const reserved = await client.query(`select public.reserve_company_user_seat_v1($1) as r`, [missingBasic]);
  const occAfterReserve = await occupancy(missingBasic);
  assert.equal(occAfterReserve.users.max_allowed, 5);
  assert.equal(occAfterReserve.users.pending_reservations, 1);
  console.log("  ✓ 8/10/11 missing Basic row GET resolves 5/1 same as mutation");
  void reserved;

  const missingEnt = await makeCompany("missing-ent");
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [missingEnt, entId]);
  await client.query(`delete from public.company_resource_limits where company_id = $1`, [missingEnt]);
  occ = await occupancy(missingEnt);
  assert.equal(occ.users.max_allowed, null);
  assert.equal(occ.users.is_unlimited, true);
  assert.equal(occ.branches.max_allowed, 20);
  console.log("  ✓ 9 missing Enterprise row GET resolves NULL/20");

  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [await makeCompany("pro-reg"), proId]);
  const proCo = await makeCompany("pro-reg-2");
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [proCo, proId]);
  occ = await occupancy(proCo);
  assert.equal(occ.users.max_allowed, 25);
  assert.equal(occ.branches.max_allowed, 5);
  console.log("  ✓ 22/23 Basic 5/1 already checked; Pro 25/5");

  const trialCo = await makeCompany("trial");
  await client.query(`select public._apply_company_resource_limits_from_plan($1, $2, 'trial')`, [trialCo, basicId]);
  occ = await occupancy(trialCo);
  assert.equal(occ.users.max_allowed, 5);
  assert.equal(occ.branches.max_allowed, 1);
  console.log("  ✓ 25 Trial 5/1");

  await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"authenticated\"}', true)");
  await expectFail(
    "member_reserve",
    () => client.query(`select public.reserve_company_user_seat_v1($1)`, [companyId]),
    /Insufficient permissions/,
  );
  console.log("  ✓ 17 ordinary authenticated caller cannot reserve");

  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
  await client.query(`select public.reserve_company_user_seat_v1($1)`, [missingEnt]);
  console.log("  ✓ 20 service_role can reserve");

  const sqlReserve = sql308;
  assert.match(sqlReserve, /user_has_permission_in_company\(p_company_id, 'users\.edit'\)/);
  console.log("  ✓ 16/18/19 users.edit + tenant check present in reserve RPC");

  const provision = readFileSync(new URL("../supabase/functions/provision-user/index.ts", import.meta.url), "utf8");
  assert.match(provision, /reserve_company_user_seat_v1/);
  console.log("  ✓ 21 provision-user still reserves before invite");

  const overview = readFileSync(
    new URL("../artifacts/login-app/src/components/company-workspace/tabs/company-overview-tab.tsx", import.meta.url),
    "utf8",
  );
  const planPanel = readFileSync(
    new URL("../artifacts/login-app/src/components/billing/panels/plan-experience-panel.tsx", import.meta.url),
    "utf8",
  );
  const subTab = readFileSync(
    new URL("../artifacts/login-app/src/components/company-workspace/tabs/company-subscription-tab.tsx", import.meta.url),
    "utf8",
  );
  const usersPage = readFileSync(new URL("../artifacts/login-app/src/pages/users.tsx", import.meta.url), "utf8");
  assert.match(overview, /useCompanyResourceOccupancy/);
  assert.match(overview, /occupancyDisplayUsed/);
  assert.doesNotMatch(overview, /seatsLimit = plan\?\.max_users/);
  assert.match(planPanel, /useCompanyResourceOccupancy/);
  assert.doesNotMatch(planPanel, /subscription\.plan\?\.max_users \?\? billingNotAvailable/);
  assert.match(subTab, /occupancyDisplayUsed/);
  assert.doesNotMatch(subTab, /bundle\?\.counts\.employees/);
  assert.match(usersPage, /occupancyDisplayUsed/);
  console.log("  ✓ 12-15 overview/plan/subscription/users use occupancy RPC");

  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [proCo, basicId]);
  occ = await occupancy(proCo);
  assert.equal(occ.users.max_allowed, 5);
  console.log("  ✓ 26 downgrade updates frozen user max");

  occ = await occupancy(companyId);
  assert.ok(occ.branches);
  console.log("  ✓ 27 branch occupancy payload still present");

  const metrics = await client.query(
    `select code from public.usage_metric_definitions where code = any($1)`,
    [["ai_email_routing", "ai_employee_email", "api_calls", "whatsapp_messages", "ai_tokens", "emails_sent"]],
  );
  assert.equal(metrics.rowCount, 6);
  console.log("  ✓ 28 quota metric catalog unchanged");

  await client.query("rollback");
  console.log("\nverify-308: ok\n");
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}
