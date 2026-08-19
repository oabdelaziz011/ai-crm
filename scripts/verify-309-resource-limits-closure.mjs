/**
 * Task 7F — close 7E test gaps (test-only).
 * Run: node scripts/verify-309-resource-limits-closure.mjs
 *
 * Uses two independent pg connections for real overlapping RPC/INSERTs.
 * Does not change production SQL, RLS, or UI.
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

const ssl = { rejectUnauthorized: false };
const setup = new pg.Client({ connectionString: env.DATABASE_URL, ssl });
const sessionA = new pg.Client({ connectionString: env.DATABASE_URL, ssl });
const sessionB = new pg.Client({ connectionString: env.DATABASE_URL, ssl });

const PREFIX = "RL7F ";
const createdCompanies = [];
const createdUsers = [];

await setup.connect();
await sessionA.connect();
await sessionB.connect();
console.log("\nTask 7F resource-limits security + concurrency closure\n");

async function asService(client) {
  await client.query("select set_config('request.jwt.claim.role', 'service_role', false)");
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)");
  await client.query("select set_config('request.jwt.claim.sub', '', false)");
}

async function asUser(client, userId) {
  const claims = JSON.stringify({ role: "authenticated", sub: userId });
  await client.query("select set_config('request.jwt.claim.role', 'authenticated', false)");
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await client.query("select set_config('request.jwt.claims', $1, false)", [claims]);
}

async function asAnon(client) {
  await client.query("select set_config('request.jwt.claim.role', 'anon', false)");
  await client.query("select set_config('request.jwt.claim.sub', '', false)");
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', false)");
}

async function occupancy(companyId, client = setup) {
  const r = await client.query(`select public.get_company_resource_occupancy_v1($1) as o`, [companyId]);
  return r.rows[0].o;
}

async function makeCompany(suffix) {
  const co = await setup.query(
    `
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      $1, 'Active', 'Basic', 'active', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `,
    [`${PREFIX}${suffix} ${crypto.randomUUID()}`],
  );
  const companyId = co.rows[0].id;
  createdCompanies.push(companyId);
  await setup.query(`select public._ensure_core_system_feature_grants($1)`, [companyId]);
  if (
    (await setup.query(`select to_regprocedure('public._ensure_company_subscription_row(uuid)') is not null as ok`))
      .rows[0].ok
  ) {
    await setup.query(`select public._ensure_company_subscription_row($1)`, [companyId]);
  }
  return companyId;
}

async function insertAuthUser(email) {
  const row = await setup.query(
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
      crypt('rl7f-test', gen_salt('bf')),
      now(), now(), now(),
      '{}'::jsonb,
      '{}'::jsonb
    ) returning id
  `,
    [email],
  );
  const id = row.rows[0].id;
  createdUsers.push(id);
  return id;
}

async function attachUser(companyId, { active = true, superAdmin = false } = {}) {
  const id = await insertAuthUser(`rl7f-${crypto.randomUUID()}@example.test`);
  await setup.query(
    `
    insert into public.profiles (id, user_id, email, company_id, is_active, is_super_admin)
    values ($1, $1, $2, $3, $4, $5)
    on conflict (id) do update
      set company_id = excluded.company_id,
          is_active = excluded.is_active,
          is_super_admin = excluded.is_super_admin
  `,
    [id, `${id}@example.test`, companyId, active, superAdmin],
  );
  return id;
}

async function grantUsersEdit(companyId, userId) {
  const perm = await setup.query(`select id from public.permissions where code = 'users.edit' limit 1`);
  assert.ok(perm.rows[0]?.id, "users.edit permission must exist");
  const role = await setup.query(
    `
    insert into public.roles (company_id, name, is_system, role_type, template_key)
    values ($1, $2, false, 'CUSTOM', null)
    returning id
  `,
    [companyId, `RL7F editor ${crypto.randomUUID().slice(0, 8)}`],
  );
  await setup.query(`insert into public.role_permissions (role_id, permission_id) values ($1, $2)`, [
    role.rows[0].id,
    perm.rows[0].id,
  ]);
  await setup.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [userId, role.rows[0].id]);
}

async function grantCompanyAdminTemplate(companyId, userId) {
  let role = await setup.query(
    `select id from public.roles where company_id = $1 and template_key = 'admin' limit 1`,
    [companyId],
  );
  if (!role.rows[0]) {
    role = await setup.query(
      `
      insert into public.roles (company_id, name, is_system, role_type, template_key)
      values ($1, $2, true, 'DEFAULT', 'admin')
      returning id
    `,
      [companyId, `RL7F admin ${crypto.randomUUID().slice(0, 8)}`],
    );
  }
  await setup.query(
    `insert into public.user_roles (user_id, role_id) values ($1, $2) on conflict do nothing`,
    [userId, role.rows[0].id],
  );
}

async function cleanup() {
  for (const id of createdCompanies) {
    await setup.query(
      `update public.companies set company_type = 'platform' where id = $1`,
      [id],
    );
    await setup.query(`delete from public.company_user_seat_reservations where company_id = $1`, [id]);
    await setup.query(`delete from public.branches where company_id = $1`, [id]);
    await setup.query(
      `delete from public.user_roles where user_id in (select id from public.profiles where company_id = $1)`,
      [id],
    );
    await setup.query(`delete from public.roles where company_id = $1 and name like 'RL7F%'`, [id]);
    await setup.query(`update public.profiles set company_id = null, is_active = false where company_id = $1`, [id]);
    await setup.query(`delete from public.company_resource_limits where company_id = $1`, [id]);
    await setup.query(`delete from public.company_subscriptions where company_id = $1`, [id]);
    try {
      await setup.query(`delete from public.companies where id = $1`, [id]);
    } catch {
      await setup.query(
        `update public.companies
         set name = 'RL7F DELETED ' || id::text, status = 'Suspended', company_type = 'platform'
         where id = $1`,
        [id],
      );
    }
  }
  for (const id of createdUsers) {
    await setup.query(`delete from public.profiles where id = $1`, [id]);
    await setup.query(`delete from auth.users where id = $1`, [id]);
  }
  await setup.query(
    `delete from public.profiles where id in (select id from auth.users where email like 'rl7f-%@example.test')`,
  );
  await setup.query(`delete from auth.users where email like 'rl7f-%@example.test'`);
}

try {
  await asService(setup);
  await asService(sessionA);
  await asService(sessionB);

  // ── A. True two-session user race (max=5, occupying=4) ──
  const userCo = await makeCompany("user-race");
  await setup.query(`select public.set_company_resource_limits_v1($1, 5, 1, 'manual')`, [userCo]);
  for (let i = 0; i < 4; i += 1) {
    await attachUser(userCo, { active: true });
  }
  let occ = await occupancy(userCo);
  assert.equal(occ.users.current_count, 4);
  assert.equal(occ.users.max_allowed, 5);

  const started = Date.now();
  const [userA, userB] = await Promise.allSettled([
    sessionA.query(`select public.reserve_company_user_seat_v1($1) as r`, [userCo]),
    sessionB.query(`select public.reserve_company_user_seat_v1($1) as r`, [userCo]),
  ]);
  const elapsedMs = Date.now() - started;
  const userWins = [userA, userB].filter((r) => r.status === "fulfilled");
  const userFails = [userA, userB].filter((r) => r.status === "rejected");
  assert.equal(userWins.length, 1, `user race expected 1 win, got ${userWins.length} (elapsed ${elapsedMs}ms)`);
  assert.equal(userFails.length, 1, "user race expected 1 failure");
  assert.match(String(userFails[0].reason?.message ?? ""), /user_seat_limit_reached/);
  occ = await occupancy(userCo);
  assert.equal(occ.users.current_count, 4);
  assert.equal(occ.users.pending_reservations, 1);
  assert.equal(occ.users.effective_used, 5);
  assert.ok(occ.users.effective_used <= 5);
  const openRes = await setup.query(
    `select count(*)::int as n from public.company_user_seat_reservations
     where company_id = $1 and consumed_at is null and released_at is null and expires_at > now()`,
    [userCo],
  );
  assert.equal(openRes.rows[0].n, 1, "failed reserve must not leave a second open reservation");
  console.log(`  ✓ A true two-session user reserve race (1 win / 1 lose, effective_used=5, ${elapsedMs}ms)`);

  // ── B. True two-session branch race (max=1, current=0) ──
  const branchCo = await makeCompany("branch-race");
  await setup.query(`select public.set_company_resource_limits_v1($1, 5, 1, 'manual')`, [branchCo]);
  const [brA, brB] = await Promise.allSettled([
    sessionA.query(
      `insert into public.branches (company_id, name, timezone, status)
       values ($1, 'Race A', 'UTC', 'active') returning id`,
      [branchCo],
    ),
    sessionB.query(
      `insert into public.branches (company_id, name, timezone, status)
       values ($1, 'Race B', 'UTC', 'active') returning id`,
      [branchCo],
    ),
  ]);
  const brWins = [brA, brB].filter((r) => r.status === "fulfilled");
  const brFails = [brA, brB].filter((r) => r.status === "rejected");
  assert.equal(brWins.length, 1, `branch race expected 1 win, got ${brWins.length}`);
  assert.equal(brFails.length, 1, "branch race expected 1 failure");
  assert.match(String(brFails[0].reason?.message ?? ""), /branch_limit_reached/);
  const branchN = await setup.query(
    `select count(*)::int as n from public.branches where company_id = $1 and deleted_at is null`,
    [branchCo],
  );
  assert.equal(branchN.rows[0].n, 1);
  occ = await occupancy(branchCo);
  assert.equal(occ.branches.current_count, 1);
  console.log("  ✓ B true two-session branch insert race (1 win / 1 lose, count=1)");

  // ── C/D JWT users.edit + cross-tenant ──
  const coA = await makeCompany("jwt-a");
  const coB = await makeCompany("jwt-b");
  await setup.query(`select public.set_company_resource_limits_v1($1, 5, 1, 'manual')`, [coA]);
  await setup.query(`select public.set_company_resource_limits_v1($1, 5, 1, 'manual')`, [coB]);

  const editorA = await attachUser(coA, { active: true });
  const employeeA = await attachUser(coA, { active: true });
  const editorB = await attachUser(coB, { active: true });
  await grantCompanyAdminTemplate(coA, editorA);
  await grantCompanyAdminTemplate(coB, editorB);
  await grantUsersEdit(coA, editorA);
  await grantUsersEdit(coB, editorB);

  await asUser(sessionA, editorA);
  const editOk = await sessionA.query(`select public.reserve_company_user_seat_v1($1) as r`, [coA]);
  assert.ok(editOk.rows[0].r.reservation_id);
  console.log("  ✓ C1 users.edit JWT can reserve in own company");

  await asUser(sessionA, employeeA);
  let denied = false;
  try {
    await sessionA.query(`select public.reserve_company_user_seat_v1($1)`, [coA]);
  } catch (error) {
    denied = /Insufficient permissions/i.test(String(error.message));
  }
  assert.equal(denied, true);
  console.log("  ✓ C2 employee without users.edit denied");

  await asAnon(sessionA);
  denied = false;
  let anonMessage = "";
  try {
    await sessionA.query(`select public.reserve_company_user_seat_v1($1)`, [coA]);
  } catch (error) {
    anonMessage = String(error.message);
    denied = /Authentication required|Insufficient permissions/i.test(anonMessage);
  }
  assert.equal(denied, true, `unauthenticated reserve expected deny, got: ${anonMessage || "SUCCESS"}`);
  console.log("  ✓ C3 unauthenticated reserve denied");

  await asUser(sessionA, editorA);
  denied = false;
  try {
    await sessionA.query(`select public.reserve_company_user_seat_v1($1)`, [coB]);
  } catch (error) {
    denied = /Insufficient permissions/i.test(String(error.message));
  }
  assert.equal(denied, true);
  console.log("  ✓ D1 users.edit in A cannot reserve for B");

  denied = false;
  try {
    await sessionA.query(`select public.get_company_resource_occupancy_v1($1)`, [coB]);
  } catch (error) {
    denied = /Insufficient permissions/i.test(String(error.message));
  }
  assert.equal(denied, true);
  console.log("  ✓ D2 A cannot read B occupancy");

  denied = false;
  try {
    await sessionA.query(`select public.set_company_resource_limits_v1($1, 99, 99, 'manual')`, [coA]);
  } catch (error) {
    denied = /Insufficient permissions/i.test(String(error.message));
  }
  assert.equal(denied, true);
  console.log("  ✓ D3 company users.edit cannot raise resource limits");

  await asUser(sessionB, editorB);
  denied = false;
  try {
    await sessionB.query(`select public.reserve_company_user_seat_v1($1)`, [coA]);
  } catch (error) {
    denied = /Insufficient permissions/i.test(String(error.message));
  }
  assert.equal(denied, true);
  console.log("  ✓ D4 users.edit in B cannot reserve for A");

  await asService(sessionA);
  await asService(sessionB);

  // ── E. Activation / reactivation (two admins so last-admin is not hit) ──
  const actCo = await makeCompany("activate");
  await setup.query(`select public.set_company_resource_limits_v1($1, 5, 1, 'manual')`, [actCo]);
  const admin1 = await attachUser(actCo, { active: true });
  const admin2 = await attachUser(actCo, { active: true });
  await grantCompanyAdminTemplate(actCo, admin1);
  await grantCompanyAdminTemplate(actCo, admin2);
  const occupant = await attachUser(actCo, { active: true });
  await attachUser(actCo, { active: true });
  await attachUser(actCo, { active: true });
  const inactive = await attachUser(actCo, { active: false });
  occ = await occupancy(actCo);
  assert.equal(occ.users.current_count, 5);

  let activateDenied = false;
  try {
    await setup.query(`update public.profiles set is_active = true where id = $1`, [inactive]);
  } catch (error) {
    activateDenied = /user_seat_limit_reached/i.test(String(error.message));
  }
  assert.equal(activateDenied, true);
  console.log("  ✓ E-A activate extra user at 5/5 denied by occupancy");

  await setup.query(`update public.profiles set is_active = false where id = $1`, [occupant]);
  occ = await occupancy(actCo);
  assert.equal(occ.users.current_count, 4);

  await setup.query(`update public.profiles set is_active = true where id = $1`, [inactive]);
  occ = await occupancy(actCo);
  assert.equal(occ.users.current_count, 5);
  console.log("  ✓ E-B/C deactivate non-last-admin then reactivate unused seat allowed");

  await setup.query(`update public.profiles set is_active = false where id = $1`, [inactive]);
  const filler = await attachUser(actCo, { active: true });
  occ = await occupancy(actCo);
  assert.equal(occ.users.current_count, 5);
  activateDenied = false;
  try {
    await setup.query(`update public.profiles set is_active = true where id = $1`, [occupant]);
  } catch (error) {
    activateDenied = /user_seat_limit_reached/i.test(String(error.message));
  }
  assert.equal(activateDenied, true);
  console.log("  ✓ E-D/E refill then reactivate original occupant denied");
  void filler;

  const lastAdminCo = await makeCompany("last-admin");
  await setup.query(`select public.set_company_resource_limits_v1($1, 5, 1, 'manual')`, [lastAdminCo]);
  const la1 = await attachUser(lastAdminCo, { active: true });
  await attachUser(lastAdminCo, { active: true });
  let lastAdminDenied = false;
  try {
    await setup.query(`update public.profiles set is_active = false where id = $1`, [la1]);
  } catch (error) {
    lastAdminDenied = /at least one active Company Administrator/i.test(String(error.message));
  }
  assert.equal(lastAdminDenied, true);
  console.log("  ✓ E last-admin still blocks deactivation when no admin assignee remains");

  // ── F. Reservation lifecycle (cheap) ──
  const lifeCo = await makeCompany("lifecycle");
  await setup.query(`select public.set_company_resource_limits_v1($1, 5, 1, 'manual')`, [lifeCo]);
  const r1 = await setup.query(`select public.reserve_company_user_seat_v1($1) as r`, [lifeCo]);
  const resId = r1.rows[0].r.reservation_id;
  await setup.query(`select public.release_company_user_seat_v1($1)`, [resId]);
  occ = await occupancy(lifeCo);
  assert.equal(occ.users.pending_reservations, 0);
  const r2 = await setup.query(`select public.reserve_company_user_seat_v1($1) as r`, [lifeCo]);
  await setup.query(
    `update public.company_user_seat_reservations set consumed_at = now() where id = $1`,
    [r2.rows[0].r.reservation_id],
  );
  occ = await occupancy(lifeCo);
  assert.equal(occ.users.pending_reservations, 0);
  const r3 = await setup.query(`select public.reserve_company_user_seat_v1($1) as r`, [lifeCo]);
  await setup.query(
    `update public.company_user_seat_reservations set expires_at = now() - interval '1 minute' where id = $1`,
    [r3.rows[0].r.reservation_id],
  );
  occ = await occupancy(lifeCo);
  assert.equal(occ.users.pending_reservations, 0);
  console.log("  ✓ F released/consumed/expired reservations excluded from effective_used");

  // ── G. set limits still service/super-admin ──
  await asUser(sessionA, editorA);
  denied = false;
  try {
    await sessionA.query(`select public.set_company_resource_limits_v1($1, 50, 10, 'contract')`, [coB]);
  } catch (error) {
    denied = /Insufficient permissions/i.test(String(error.message));
  }
  assert.equal(denied, true);
  await asService(setup);
  await setup.query(`select public.set_company_resource_limits_v1($1, 8, 2, 'contract')`, [coA]);
  occ = await occupancy(coA);
  assert.equal(occ.users.max_allowed, 8);
  console.log("  ✓ G tenant cannot set other-company limits; service_role can set custom");

  console.log("\nverify-309: ok\n");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    await asService(setup);
    await cleanup();
  } catch (cleanupError) {
    console.error("cleanup failed", cleanupError);
  }
  await setup.end();
  await sessionA.end();
  await sessionB.end();
}
