/**
 * Live verification for company suspend/reject access reasons (migration 309).
 * Run: node scripts/verify-company-access-reasons-live.mjs
 *
 * Applies supabase/migrations/309_company_access_reasons.sql only if
 * companies.suspension_reason is missing. Does not rewrite 309.
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
  console.log("DATABASE_URL missing — cannot run live verification");
  process.exit(2);
}

const ar = JSON.parse(
  readFileSync(resolve(root, "artifacts/login-app/src/locales/ar/common.json"), "utf8"),
);
const sql309 = readFileSync(resolve(root, "supabase/migrations/309_company_access_reasons.sql"), "utf8");
const gateSrc = readFileSync(
  resolve(root, "artifacts/login-app/src/lib/companies/company-access-state.ts"),
  "utf8",
);
const dashSrc = readFileSync(resolve(root, "artifacts/login-app/src/pages/dashboard/index.tsx"), "utf8");

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const PREFIX = "CAR309 ";
const createdCompanies = [];
const createdUsers = [];

function gate(input) {
  if (input.isSuperAdmin) return null;
  if (input.status === "Suspended") {
    const reason = String(input.suspensionReason ?? "").trim();
    return { kind: "suspended", reason: reason || null };
  }
  if (input.approvalStatus === "rejected") {
    const reason = String(input.rejectionReason ?? "").trim();
    return { kind: "rejected", reason: reason || null };
  }
  return null;
}

function assertNoInternals(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert.doesNotMatch(text, /sqlstate|permission denied|row-level security|stack|pg_/i);
}

async function asService() {
  await client.query("select set_config('request.jwt.claim.role', 'service_role', false)");
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)");
  await client.query("select set_config('request.jwt.claim.sub', '', false)");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', false)");
}

async function asUser(userId) {
  const claims = JSON.stringify({ role: "authenticated", sub: userId });
  await client.query("select set_config('request.jwt.claim.role', 'authenticated', false)");
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await client.query("select set_config('request.jwt.claims', $1, false)", [claims]);
}

async function columnExists(name) {
  const r = await client.query(
    `select exists(
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'companies' and column_name = $1
     ) as ok`,
    [name],
  );
  return Boolean(r.rows[0].ok);
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
      crypt('car309-test', gen_salt('bf')),
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

async function attachUser(companyId, { superAdmin = false } = {}) {
  const id = await insertAuthUser(`car309-${crypto.randomUUID()}@example.com`);
  await client.query(
    `
    insert into public.profiles (id, user_id, email, company_id, is_active, is_super_admin)
    values ($1, $1, $2, $3, true, $4)
    on conflict (id) do update
      set company_id = excluded.company_id,
          is_active = true,
          is_super_admin = excluded.is_super_admin
  `,
    [id, `${id}@example.com`, companyId, superAdmin],
  );
  return id;
}

async function makeCompany({ approval = "approved", status = "Active" } = {}) {
  const co = await client.query(
    `
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      $1, $2, 'Basic', $3, 'tenant',
      $4, now(), 'completed'
    ) returning id
  `,
    [
      `${PREFIX}${crypto.randomUUID()}`,
      status,
      status === "Trial" ? "trialing" : "active",
      approval,
    ],
  );
  const companyId = co.rows[0].id;
  createdCompanies.push(companyId);
  if (
    (await client.query(`select to_regprocedure('public._ensure_core_system_feature_grants(uuid)') is not null as ok`))
      .rows[0].ok
  ) {
    await client.query(`select public._ensure_core_system_feature_grants($1)`, [companyId]);
  }
  if (
    (await client.query(`select to_regprocedure('public._ensure_company_subscription_row(uuid)') is not null as ok`))
      .rows[0].ok
  ) {
    await client.query(`select public._ensure_company_subscription_row($1)`, [companyId]);
  } else {
    const plan = await client.query(`select id from public.plans order by created_at nulls last limit 1`);
    await client.query(
      `insert into public.company_subscriptions (
         company_id, plan_id, status, billing_cycle,
         current_period_start, current_period_end, auto_renewal
       ) values ($1, $2, 'active', 'monthly', now(), now() + interval '30 days', true)`,
      [companyId, plan.rows[0]?.id ?? null],
    );
  }
  return companyId;
}

async function loadAuthContext() {
  const r = await client.query(`select public.load_user_auth_context() as ctx`);
  return r.rows[0].ctx;
}

await client.connect();
console.log("\nCompany access reasons live verification\n");

let failed = false;
try {
  assert.match(sql309, /suspension_reason/);
  assert.match(sql309, /suspension_reason_required/);
  assert.match(sql309, /internal\.suspend_billing_subscription/);
  assert.match(sql309, /internal\.restore_billing_subscription/);
  assert.match(sql309, /internal\.load_user_auth_context/);
  assert.match(gateSrc, /status === "Suspended"/);
  assert.match(gateSrc, /approvalStatus === "rejected"/);
  assert.match(dashSrc, /resolveTenantCompanyAccessBlock/);
  assert.match(dashSrc, /dashboard\.companyAccess\.suspendedTitle/);
  assert.equal(ar.dashboard.companyAccess.suspendedTitle, "تم إيقاف شركتكم");
  assert.equal(ar.dashboard.companyAccess.rejectedTitle, "تم رفض شركتكم");
  console.log("  ✓ source gate + Arabic copy bound to existing dashboard access screen");

  const hadColumn = await columnExists("suspension_reason");
  if (!hadColumn) {
    console.log("  ℹ companies.suspension_reason missing — applying 309_company_access_reasons.sql");
    await client.query(sql309);
  } else {
    console.log("  ✓ companies.suspension_reason already present — 309 not reapplied");
  }
  assert.equal(await columnExists("suspension_reason"), true);
  assert.equal(await columnExists("approval_rejection_reason"), true);

  const fns = await client.query(`
    select
      to_regprocedure('internal.suspend_billing_subscription(uuid,text)') is not null as suspend_ok,
      to_regprocedure('internal.restore_billing_subscription(uuid,text)') is not null as restore_ok,
      to_regprocedure('internal.load_user_auth_context(uuid)') is not null as auth_ok,
      to_regprocedure('public.suspend_billing_subscription(uuid,text)') is not null as pub_suspend,
      to_regprocedure('public.reject_company_v1(uuid,text)') is not null as reject_ok
  `);
  assert.equal(fns.rows[0].suspend_ok, true);
  assert.equal(fns.rows[0].restore_ok, true);
  assert.equal(fns.rows[0].auth_ok, true);
  assert.equal(fns.rows[0].pub_suspend, true);
  assert.equal(fns.rows[0].reject_ok, true);
  console.log("  ✓ required RPCs exist");

  const src = await client.query(`
    select pg_get_functiondef('internal.suspend_billing_subscription(uuid,text)'::regprocedure) as d
  `);
  assert.match(src.rows[0].d, /suspension_reason\s*=\s*v_reason/);
  assert.match(src.rows[0].d, /v_has_sub/);
  const restoreDef = await client.query(`
    select pg_get_functiondef('internal.restore_billing_subscription(uuid,text)'::regprocedure) as d
  `);
  assert.match(restoreDef.rows[0].d, /suspension_reason\s*=\s*null/);
  const authDef = await client.query(`
    select pg_get_functiondef('internal.load_user_auth_context(uuid)'::regprocedure) as d
  `);
  assert.match(authDef.rows[0].d, /c\.suspension_reason/);
  assert.match(authDef.rows[0].d, /c\.approval_rejection_reason/);
  console.log("  ✓ internal functions persist/return reasons");

  await asService();
  const suspendReason = "تأخر سداد الاشتراك";
  const rejectReason = "بيانات الشركة غير مكتملة.";

  const suspendCompanyId = await makeCompany({ approval: "approved", status: "Active" });
  const tenantId = await attachUser(suspendCompanyId);
  const otherCompanyId = await makeCompany({ approval: "approved", status: "Active" });
  await attachUser(otherCompanyId);
  const adminId = await attachUser(suspendCompanyId, { superAdmin: true });

  await client.query(`select public.suspend_billing_subscription($1, $2)`, [
    suspendCompanyId,
    suspendReason,
  ]);
  const suspended = await client.query(
    `select status, suspension_reason from public.companies where id = $1`,
    [suspendCompanyId],
  );
  assert.equal(suspended.rows[0].status, "Suspended");
  assert.equal(suspended.rows[0].suspension_reason, suspendReason);
  console.log("  ✓ suspend writes status=Suspended and exact suspension_reason");

  await asUser(tenantId);
  const tenantCtx = await loadAuthContext();
  assert.equal(tenantCtx.company.status, "Suspended");
  assert.equal(tenantCtx.company.suspension_reason, suspendReason);
  const blocked = gate({
    isSuperAdmin: false,
    status: tenantCtx.company.status,
    approvalStatus: tenantCtx.company.approval_status,
    suspensionReason: tenantCtx.company.suspension_reason,
    rejectionReason: tenantCtx.company.approval_rejection_reason,
  });
  assert.equal(blocked?.kind, "suspended");
  assert.equal(blocked?.reason, suspendReason);
  const suspendMessage = `${ar.dashboard.companyAccess.suspendedTitle}\n${ar.dashboard.companyAccess.suspendedReason}: ${blocked.reason}`;
  assert.match(suspendMessage, /تم إيقاف شركتكم/);
  assert.match(suspendMessage, /تأخر سداد الاشتراك/);
  assertNoInternals(tenantCtx);
  assertNoInternals(suspendMessage);
  console.log("  ✓ tenant auth context + existing gate shows Arabic suspend reason");

  await asUser(adminId);
  const adminCtx = await loadAuthContext();
  const adminBlock = gate({
    isSuperAdmin: true,
    status: adminCtx.company?.status,
    approvalStatus: adminCtx.company?.approval_status,
    suspensionReason: adminCtx.company?.suspension_reason,
    rejectionReason: adminCtx.company?.approval_rejection_reason,
  });
  assert.equal(adminBlock, null);
  console.log("  ✓ super-admin is not blocked by the tenant gate");

  await asService();
  await client.query(`select public.restore_billing_subscription($1, $2)`, [
    suspendCompanyId,
    "restored after live verify",
  ]);
  const restored = await client.query(
    `select status, suspension_reason from public.companies where id = $1`,
    [suspendCompanyId],
  );
  assert.notEqual(restored.rows[0].status, "Suspended");
  assert.equal(restored.rows[0].suspension_reason, null);
  console.log("  ✓ restore clears suspension_reason");

  const pendingId = await makeCompany({ approval: "pending", status: "Trial" });
  const pendingTenant = await attachUser(pendingId);
  await client.query(`select public.reject_company_v1($1, $2)`, [pendingId, rejectReason]);
  const rejected = await client.query(
    `select approval_status, approval_rejection_reason, status from public.companies where id = $1`,
    [pendingId],
  );
  assert.equal(rejected.rows[0].approval_status, "rejected");
  assert.equal(rejected.rows[0].approval_rejection_reason, rejectReason);
  console.log("  ✓ reject writes approval_status=rejected and exact reason");

  await asUser(pendingTenant);
  const rejectedCtx = await loadAuthContext();
  assert.equal(rejectedCtx.company.approval_status, "rejected");
  assert.equal(rejectedCtx.company.approval_rejection_reason, rejectReason);
  const rejectedBlock = gate({
    isSuperAdmin: false,
    status: rejectedCtx.company.status,
    approvalStatus: rejectedCtx.company.approval_status,
    suspensionReason: rejectedCtx.company.suspension_reason,
    rejectionReason: rejectedCtx.company.approval_rejection_reason,
  });
  assert.equal(rejectedBlock?.kind, "rejected");
  assert.equal(rejectedBlock?.reason, rejectReason);
  const rejectMessage = `${ar.dashboard.companyAccess.rejectedTitle}\n${ar.dashboard.companyAccess.rejectedReason}: ${rejectedBlock.reason}`;
  assert.match(rejectMessage, /تم رفض شركتكم/);
  assert.match(rejectMessage, /بيانات الشركة غير مكتملة/);
  assertNoInternals(rejectedCtx);
  assertNoInternals(rejectMessage);
  console.log("  ✓ tenant auth context + existing gate shows Arabic rejection reason");

  await asUser(tenantId);
  let tenantSuspendDenied = false;
  try {
    await client.query(`select public.suspend_billing_subscription($1, $2)`, [
      otherCompanyId,
      "should not work",
    ]);
  } catch {
    tenantSuspendDenied = true;
  }
  assert.equal(tenantSuspendDenied, true, "tenant suspend must fail");

  let tenantRejectDenied = false;
  try {
    await client.query(`select public.reject_company_v1($1, $2)`, [pendingId, "should not work"]);
  } catch {
    tenantRejectDenied = true;
  }
  assert.equal(tenantRejectDenied, true, "tenant reject must fail");

  await client.query("begin");
  await asUser(tenantId);
  await client.query("set local role authenticated");
  const ownHack = await client.query(
    `update public.companies set suspension_reason = 'hacked' where id = $1 returning suspension_reason`,
    [suspendCompanyId],
  );
  const rejectHack = await client.query(
    `update public.companies set approval_rejection_reason = 'hacked' where id = $1 returning approval_rejection_reason`,
    [pendingId],
  );
  const otherRead = await client.query(
    `select id, suspension_reason, approval_rejection_reason from public.companies where id = $1`,
    [otherCompanyId],
  );
  await client.query("rollback");
  assert.equal(ownHack.rowCount, 0);
  assert.equal(rejectHack.rowCount, 0);
  assert.equal(otherRead.rowCount, 0);
  console.log("  ✓ tenant cannot suspend/reject/write reasons or read another company");
} catch (error) {
  failed = true;
  console.error("  ✗", error instanceof Error ? error.stack ?? error.message : error);
} finally {
  try {
    await asService();
    if (createdCompanies.length) {
      await client.query(`update public.companies set company_type = 'platform' where id = any($1::uuid[])`, [
        createdCompanies,
      ]);
    }
    for (const id of createdUsers) {
      await client.query(`delete from public.profiles where id = $1 or user_id = $1`, [id]).catch(() => {});
      await client.query(`delete from auth.users where id = $1`, [id]).catch(() => {});
    }
    if (createdCompanies.length) {
      await client.query(`delete from public.companies where id = any($1::uuid[])`, [createdCompanies]).catch(() => {});
    }
  } catch (cleanupError) {
    console.warn("  ⚠ cleanup:", cleanupError instanceof Error ? cleanupError.message : cleanupError);
  }
  await client.end();
}

if (failed) process.exit(1);
console.log("\nLIVE VERIFICATION PASSED\n");
