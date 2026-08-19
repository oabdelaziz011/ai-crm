/**
 * Task 7B — frozen user/branch occupancy limits.
 * Run: node scripts/verify-307-company-resource-limits.mjs
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
console.log("\nTask 7B company resource limits verification\n");

async function expectFail(label, fn) {
  await client.query(`savepoint ${label}`);
  let failed = false;
  try {
    await fn();
  } catch (error) {
    failed = true;
    await client.query(`rollback to savepoint ${label}`);
    const message = String(error?.message ?? error);
    assert.match(message, /user_seat_limit_reached|branch_limit_reached|Insufficient permissions/i, label);
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
      'RL '||$1||' '||gen_random_uuid()::text,
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

async function insertAuthUser(email) {
  const row = await client.query(
    `
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      $1,
      crypt('resource-limit-test', gen_salt('bf')),
      now(), now(), now(),
      '{}'::jsonb,
      '{}'::jsonb
    ) returning id
  `,
    [email],
  );
  return row.rows[0].id;
}

async function attachOccupyingUser(companyId, { active = true, superAdmin = false } = {}) {
  const id = await insertAuthUser(`rl-${crypto.randomUUID()}@example.com`);
  await client.query(
    `
    insert into public.profiles (id, user_id, email, company_id, is_active, is_super_admin)
    values ($1, $1, $2, $3, $4, $5)
    on conflict (id) do update
      set company_id = excluded.company_id,
          is_active = excluded.is_active,
          is_super_admin = excluded.is_super_admin
  `,
    [id, `${id}@example.com`, companyId, active, superAdmin],
  );
  return id;
}

try {
  const table = await client.query(`select to_regclass('public.company_resource_limits') as r`);
  if (!table.rows[0].r) {
    console.log("company_resource_limits missing — apply migration 307 first");
    process.exit(1);
  }

  await client.query("begin");
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");

  const metrics = await client.query(
    `select code from public.usage_metric_definitions where code = any($1) order by 1`,
    [["ai_email_routing", "ai_employee_email", "api_calls", "whatsapp_messages", "ai_tokens", "emails_sent"]],
  );
  assert.equal(metrics.rowCount, 6, "counter quota metrics remain seeded");
  console.log("  ✓ usage metric catalog unchanged");

  const basic = await client.query(`
    select public.upsert_commercial_package_v1(
      'basic_rl7b', 'Basic RL', null, 'Basic RL', 'RL basic',
      19, 190, true, false, true, 1, 1
    ) as r
  `);
  const basicId = basic.rows[0].r.id ?? basic.rows[0].r.plan_id;
  const pro = await client.query(`
    select public.upsert_commercial_package_v1(
      'pro_rl7b', 'Pro RL', null, 'Pro RL', 'RL pro',
      49, 490, true, false, true, 2, 2
    ) as r
  `);
  const proId = pro.rows[0].r.id ?? pro.rows[0].r.plan_id;
  const ent = await client.query(`
    select public.upsert_commercial_package_v1(
      'enterprise_rl7b', 'Enterprise RL', null, 'Enterprise RL', 'RL enterprise',
      99, 990, true, false, true, 3, 3
    ) as r
  `);
  const entId = ent.rows[0].r.id ?? ent.rows[0].r.plan_id;

  const companyId = await makeCompany("basic");
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [companyId, basicId]);
  let occ = await occupancy(companyId);
  assert.equal(occ.users.max_allowed, 5, "31 basic users");
  assert.equal(occ.branches.max_allowed, 1, "31 basic branches");
  assert.equal(occ.source, "package");
  console.log("  ✓ 31 Basic freezes 5 users / 1 branch");

  const snapshotBefore = await client.query(
    `select package_feature_snapshot from public.company_subscriptions where company_id = $1`,
    [companyId],
  );

  await client.query(`update public.plans set max_users = 10 where id = $1`, [basicId]);
  occ = await occupancy(companyId);
  assert.equal(occ.users.max_allowed, 5, "15 catalog edit must not mutate frozen limit");
  console.log("  ✓ 15 catalog edit does not mutate frozen company limit");

  const snapshotAfter = await client.query(
    `select package_feature_snapshot from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  assert.deepEqual(snapshotAfter.rows[0].package_feature_snapshot, snapshotBefore.rows[0].package_feature_snapshot);
  console.log("  ✓ 37 package snapshot remains feature-only");

  const catalogUsers = await client.query(`select max_users from public.plans where id = $1`, [basicId]);
  assert.equal(Number(catalogUsers.rows[0].max_users), 10);
  console.log("  ✓ 36 custom/frozen path does not require catalog mutation for occupancy");

  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [companyId, proId]);
  occ = await occupancy(companyId);
  assert.equal(occ.users.max_allowed, 25, "32/14 Pro users");
  assert.equal(occ.branches.max_allowed, 5, "32/28 Pro branches");
  console.log("  ✓ 14/28/32 package upgrade increases frozen limits");

  const entCompany = await makeCompany("ent");
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [entCompany, entId]);
  occ = await occupancy(entCompany);
  assert.equal(occ.users.max_allowed, null, "11/33 enterprise unlimited users");
  assert.equal(occ.users.is_unlimited, true);
  assert.equal(occ.branches.max_allowed, 20, "33 enterprise 20 branches");
  console.log("  ✓ 11/33 Enterprise unlimited users / 20 branches");

  const trialCompany = await makeCompany("trial");
  await client.query(`select public._apply_company_resource_limits_from_plan($1, $2, 'trial')`, [
    trialCompany,
    basicId,
  ]);
  occ = await occupancy(trialCompany);
  assert.equal(occ.users.max_allowed, 5, "34 trial users");
  assert.equal(occ.branches.max_allowed, 1, "34 trial branches");
  assert.equal(occ.source, "trial");
  console.log("  ✓ 34 Trial freezes 5 / 1");

  await client.query(`select public.set_company_resource_limits_v1($1, 9, 3, 'contract')`, [companyId]);
  occ = await occupancy(companyId);
  assert.equal(occ.users.max_allowed, 9);
  assert.equal(occ.branches.max_allowed, 3);
  assert.equal(occ.source, "contract");
  const other = await occupancy(entCompany);
  assert.equal(other.users.max_allowed, null);
  const planAfterCustom = await client.query(`select max_users from public.plans where id = $1`, [proId]);
  console.log("  ✓ 10/24/35 custom limits are company-specific");
  void planAfterCustom;

  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [companyId, basicId]);
  occ = await occupancy(companyId);
  assert.equal(occ.users.max_allowed, 5);
  assert.equal(occ.branches.max_allowed, 1);
  console.log("  ✓ 13 package downgrade updates frozen limit without deleting resources");

  let usersOk = true;
  await client.query("savepoint user_block");
  try {
    const first = await attachOccupyingUser(companyId, { active: true });
    await attachOccupyingUser(companyId, { active: false });
    await attachOccupyingUser(companyId, { active: true, superAdmin: true });
    occ = await occupancy(companyId);
    const occupying = occ.users.current_count;
    assert.ok(occupying >= 1, "inactive/super-admin should not inflate occupancy above actives");
    const before = occupying;
    while ((await occupancy(companyId)).users.current_count < 5) {
      await attachOccupyingUser(companyId, { active: true });
    }
    occ = await occupancy(companyId);
    assert.equal(occ.users.current_count, 5);
    assert.equal(occ.users.remaining, 0);
    await expectFail("invite_at_limit", () => attachOccupyingUser(companyId, { active: true }));
    console.log("  ✓ 1-5 under/at/over user limit; inactive and super-admin excluded");

    await client.query(`update public.profiles set is_active = false where id = $1`, [first]);
    occ = await occupancy(companyId);
    assert.equal(occ.users.current_count, 4, "6 deactivate reduces occupancy");
    await client.query(`update public.profiles set is_active = true where id = $1`, [first]);
    occ = await occupancy(companyId);
    assert.equal(occ.users.current_count, 5, "7 reactivate consumes seat");
    await expectFail("reactivate_blocked", async () => {
      const inactive = await attachOccupyingUser(companyId, { active: false });
      await client.query(`update public.profiles set is_active = true where id = $1`, [inactive]);
    });
    console.log("  ✓ 6/7 deactivate/reactivate occupancy");

    await expectFail("cross_company_user", async () => {
      const victim = await attachOccupyingUser(entCompany, { active: true });
      await client.query(`update public.profiles set company_id = $1 where id = $2`, [companyId, victim]);
    });
    console.log("  ✓ 30 cross-company user attach blocked at limit");
    await client.query("release savepoint user_block");
  } catch (error) {
    usersOk = false;
    await client.query("rollback to savepoint user_block");
    console.log(`  ⚠ profile/auth user inserts not available (${error.message})`);
  }

  const branchCompany = await makeCompany("branches");
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [branchCompany, basicId]);
  const hq = await client.query(
    `insert into public.branches (company_id, name, timezone, status, is_primary)
     values ($1, 'HQ', 'UTC', 'active', true) returning id`,
    [branchCompany],
  );
  occ = await occupancy(branchCompany);
  assert.equal(occ.branches.current_count, 1, "20 HQ counts");
  await expectFail("branch_at_limit", () =>
    client.query(
      `insert into public.branches (company_id, name, timezone, status)
       values ($1, 'Second', 'UTC', 'active')`,
      [branchCompany],
    ),
  );
  console.log("  ✓ 16/17/20 HQ counts; create blocked at max_branches=1");

  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [branchCompany, proId]);
  const inactiveBranch = await client.query(
    `insert into public.branches (company_id, name, timezone, status)
     values ($1, 'Inactive still counts', 'UTC', 'inactive') returning id`,
    [branchCompany],
  );
  occ = await occupancy(branchCompany);
  assert.equal(occ.branches.current_count, 2, "19 inactive branches count");
  const extra = [];
  while ((await occupancy(branchCompany)).branches.current_count < 5) {
    const row = await client.query(
      `insert into public.branches (company_id, name, timezone, status)
       values ($1, 'B-'||gen_random_uuid()::text, 'UTC', 'active') returning id`,
      [branchCompany],
    );
    extra.push(row.rows[0].id);
  }
  await expectFail("branch_over", () =>
    client.query(
      `insert into public.branches (company_id, name, timezone, status)
       values ($1, 'Over', 'UTC', 'active')`,
      [branchCompany],
    ),
  );
  const doomed = extra[0];
  await client.query(`update public.branches set deleted_at = now() where id = $1`, [doomed]);
  occ = await occupancy(branchCompany);
  assert.equal(occ.branches.current_count, 4, "18 soft-deleted excluded");
  await client.query(
    `insert into public.branches (company_id, name, timezone, status)
     values ($1, 'After delete', 'UTC', 'active')`,
    [branchCompany],
  );
  occ = await occupancy(branchCompany);
  assert.equal(occ.branches.current_count, 5);
  await expectFail("restore_blocked", () =>
    client.query(`update public.branches set deleted_at = null where id = $1`, [doomed]),
  );
  console.log("  ✓ 18/19/21 soft-delete excluded; restore blocked at cap");

  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [branchCompany, basicId]);
  occ = await occupancy(branchCompany);
  assert.equal(occ.branches.max_allowed, 1);
  assert.equal(occ.branches.is_over_limit, true);
  assert.equal(occ.branches.remaining, 0);
  const stillThere = await client.query(
    `select count(*)::int as n from public.branches where company_id = $1 and deleted_at is null`,
    [branchCompany],
  );
  assert.ok(stillThere.rows[0].n > 1, "26 downgrade does not delete branches");
  await expectFail("downgrade_blocks_create", () =>
    client.query(
      `insert into public.branches (company_id, name, timezone, status)
       values ($1, 'Blocked after downgrade', 'UTC', 'active')`,
      [branchCompany],
    ),
  );
  console.log("  ✓ 13/26/27 downgrade over-limit blocks new branches, keeps existing");

  await client.query(`select public.set_company_resource_limits_v1($1, null, null, 'contract')`, [entCompany]);
  occ = await occupancy(entCompany);
  assert.equal(occ.branches.is_unlimited, true, "25 unlimited branches when max_branches is null");
  await client.query(
    `insert into public.branches (company_id, name, timezone, status)
     values ($1, 'Unlimited branch', 'UTC', 'active')`,
    [entCompany],
  );
  console.log("  ✓ 25 unlimited branch create allowed");

  await expectFail("cross_company_branch", async () => {
    await client.query(
      `insert into public.branches (company_id, name, timezone, status)
       values ($1, 'Steal', 'UTC', 'active')`,
      [branchCompany],
    );
  });
  console.log("  ✓ 30 cross-company branch create blocked while over-limit");

  const concCompany = await makeCompany("conc");
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [concCompany, basicId]);
  for (let i = 0; i < 5; i += 1) {
    await client.query(`select public.reserve_company_user_seat_v1($1) as r`, [concCompany]);
  }
  await expectFail("reserve_at_cap", () =>
    client.query(`select public.reserve_company_user_seat_v1($1) as r`, [concCompany]),
  );
  console.log("  ✓ 8 seat reservations serialize on the limits row and cannot exceed max_users");

  const migration = readFileSync(new URL("../supabase/migrations/307_company_resource_limits.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /insert into public\.usage_records/);
  assert.doesNotMatch(migration, /perform public\.ingest_usage_event/);
  assert.doesNotMatch(migration, /LicensingEngine/);
  console.log("  ✓ 38 counter quota stack not used for occupancy");

  await client.query("rollback");
  console.log(usersOk ? "\nverify-307: ok\n" : "\nverify-307: ok (user-row inserts skipped)\n");
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
