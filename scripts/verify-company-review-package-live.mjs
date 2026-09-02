/**
 * Live DB verification: company commercial review package + feature persistence.
 * Creates a disposable onboarded company and exercises assign vs change RPC paths.
 *
 * Run: node scripts/verify-company-review-package-live.mjs
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const require = createRequire(import.meta.url);
const { createClient } = require("../artifacts/login-app/node_modules/@supabase/supabase-js");

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root);
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  throw new Error("Missing Supabase env");
}
if (!env.DATABASE_URL?.trim()) {
  throw new Error("DATABASE_URL required for DB verification");
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const stamp = Date.now();
const email = `review-pkg-${stamp}@valueor.test`;
const password = `Review!${stamp}Aa`;
const report = { stamp, steps: [], companyId: null, userId: null, email };

function step(name, ok, detail, extra = {}) {
  report.steps.push({ name, ok, detail, ...extra });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
  if (!ok) throw new Error(`${name}: ${detail}`);
}

async function commercialClient() {
  return admin;
}

async function fetchPlanByCode(code) {
  const { data, error } = await admin.from("plans").select("id, code, name").eq("code", code).eq("is_active", true).maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`plan not found: ${code}`);
  return data;
}

async function readSubscription(companyId) {
  const { data, error } = await admin
    .from("company_subscriptions")
    .select("id, plan_id, status, billing_cycle, package_feature_snapshot")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function readFeatureOverride(companyId, featureCode, source = null) {
  let q = admin
    .from("company_feature_overrides")
    .select("feature_code, override_state, source, is_active")
    .eq("company_id", companyId)
    .eq("feature_code", featureCode)
    .eq("is_active", true);
  if (source) q = q.eq("source", source);
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

const pgClient = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await pgClient.connect();

let companyId = null;
let userId = null;

try {
  console.log("\nCompany review package live verification\n");

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Review Pkg Tester" },
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  report.userId = userId;

  const userClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const signedIn = await userClient.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;

  const onboard = await userClient.rpc("onboard_own_company_v1", {
    p_payload: {
      name: `Review Pkg Co ${stamp}`,
      legal_name: `Review Pkg Legal ${stamp}`,
      business_type: "clinic",
      industry: "healthcare",
      contact_email: email,
      contact_phone: "+966500009999",
      country: "Saudi Arabia",
      city: "Riyadh",
      address: "Test Street",
      timezone: "Asia/Riyadh",
      currency: "SAR",
      owner_display_name: "Review Pkg Tester",
      owner_full_name: "Review Pkg Tester",
      owner_phone: "+966500009999",
      owner_job_title: "Owner",
    },
  });
  if (onboard.error) throw onboard.error;
  companyId = onboard.data.company_id || onboard.data.company?.id;
  report.companyId = companyId;
  step("onboard pending company", Boolean(companyId), companyId);

  const { data: companyRow } = await admin
    .from("companies")
    .select("approval_status, status, subscription_plan, plan_id")
    .eq("id", companyId)
    .single();
  step("company starts pending", companyRow?.approval_status === "pending", `approval=${companyRow?.approval_status}`);

  const sub0 = await readSubscription(companyId);
  step(
    "no subscription row until review assign (295)",
    !sub0,
    sub0 ? `unexpected sub status=${sub0.status}` : "company_subscriptions absent as expected",
  );

  const { data: companyBeforeAssign } = await admin
    .from("companies")
    .select("subscription_status, subscription_plan, plan_id")
    .eq("id", companyId)
    .single();
  step(
    "denormalized trialing before assign",
    companyBeforeAssign?.subscription_status === "trialing",
    JSON.stringify(companyBeforeAssign),
  );

  const basic = await fetchPlanByCode("basic");
  const pro = await fetchPlanByCode("pro");
  const enterprise = await fetchPlanByCode("enterprise");

  const superClient = await commercialClient();

  const assignBasic = await superClient.rpc("assign_subscription_plan", {
    p_company_id: companyId,
    p_plan_id: basic.id,
    p_billing_cycle: "monthly",
  });
  step("assign basic on trialing", !assignBasic.error, assignBasic.error?.message ?? "ok");

  const sub1 = await readSubscription(companyId);
  step("basic persisted in DB", sub1?.plan_id === basic.id, `plan_id=${sub1?.plan_id}`);

  const changeProBlocked = await superClient.rpc("change_company_package_v1", {
    p_company_id: companyId,
    p_plan_id: pro.id,
    p_reason: "should fail while trialing",
  });
  const subAfterBasic = await readSubscription(companyId);
  const trialingReproNeeded = subAfterBasic?.status === "trialing";
  if (trialingReproNeeded) {
    step(
      "change_package blocked while trialing (repro)",
      Boolean(changeProBlocked.error) && /trialing/i.test(changeProBlocked.error.message),
      changeProBlocked.error?.message ?? "unexpected success",
    );
  } else {
    step(
      "change_package allowed when assign bootstrapped active subscription (295 path)",
      !changeProBlocked.error,
      `status=${subAfterBasic?.status}, plan=${subAfterBasic?.plan_id}`,
    );
  }

  const assignPro = await superClient.rpc("assign_subscription_plan", {
    p_company_id: companyId,
    p_plan_id: pro.id,
    p_billing_cycle: "monthly",
  });
  step("assign pro on trialing (fix path)", !assignPro.error, assignPro.error?.message ?? "ok");

  const sub2 = await readSubscription(companyId);
  step("pro persisted after assign switch", sub2?.plan_id === pro.id, `plan_id=${sub2?.plan_id}`);

  const assignEnterprise = await superClient.rpc("assign_subscription_plan", {
    p_company_id: companyId,
    p_plan_id: enterprise.id,
    p_billing_cycle: "monthly",
  });
  step("assign enterprise on trialing", !assignEnterprise.error, assignEnterprise.error?.message ?? "ok");

  const sub3 = await readSubscription(companyId);
  step("enterprise persisted", sub3?.plan_id === enterprise.id, `plan_id=${sub3?.plan_id}`);

  const grantCustomers = await superClient.rpc("set_company_feature_grant", {
    p_company_id: companyId,
    p_feature_code: "customers",
    p_enabled: true,
    p_source: "manual",
  });
  step("grant customers manual", !grantCustomers.error, grantCustomers.error?.message ?? "ok");

  const revokeLeads = await superClient.rpc("revoke_company_feature_grant", {
    p_company_id: companyId,
    p_feature_code: "leads",
  });
  step("revoke leads (if present)", !revokeLeads.error, revokeLeads.error?.message ?? "ok or noop");

  const customersOverride = await readFeatureOverride(companyId, "customers", "manual");
  step(
    "customers override persisted",
    customersOverride?.override_state === "enabled" && customersOverride?.is_active === true,
    JSON.stringify(customersOverride),
  );

  const approve = await superClient.rpc("approve_company_v1", {
    p_company_id: companyId,
    p_mode: "active",
    p_notes: "Disposable review verification",
  });
  step("approve with active mode", !approve.error, approve.error?.message ?? "ok");

  const { data: approvedRow } = await admin
    .from("companies")
    .select("approval_status, status, subscription_status, plan_id")
    .eq("id", companyId)
    .single();
  step("company approved active", approvedRow?.approval_status === "approved", JSON.stringify(approvedRow));

  const subAfterApprove = await readSubscription(companyId);
  step(
    "package still enterprise after approve",
    subAfterApprove?.plan_id === enterprise.id,
    `plan_id=${subAfterApprove?.plan_id}`,
  );

  const customersAfter = await readFeatureOverride(companyId, "customers", "manual");
  step(
    "customers override survives approve",
    customersAfter?.override_state === "enabled" && customersAfter?.is_active === true,
    JSON.stringify(customersAfter),
  );

  const { rows: roleRows } = await pgClient.query(
    `select r.template_key, r.name
     from public.user_roles ur
     join public.roles r on r.id = ur.role_id
     where ur.user_id = $1 and r.company_id = $2`,
    [userId, companyId],
  );
  step(
    "owner has admin role",
    roleRows.some((row) => row.template_key === "admin"),
    roleRows.map((r) => r.template_key).join(", "),
  );

  const { rows: adminRoleRows } = await pgClient.query(
    `select id, name, template_key from public.roles where company_id = $1 and template_key = 'admin' limit 1`,
    [companyId],
  );
  const adminRoleId = adminRoleRows[0]?.id;
  step("admin role exists", Boolean(adminRoleId), adminRoleId ?? "missing");

  const { rows: permBefore } = await pgClient.query(
    `select p.code
     from public.role_permissions rp
     join public.permissions p on p.id = rp.permission_id
     where rp.role_id = $1
     order by p.code`,
    [adminRoleId],
  );
  step("admin role has permissions", permBefore.length > 0, `${permBefore.length} permissions`);

  const { rows: customersPerm } = await pgClient.query(
    `select id from public.permissions where code = 'customers.view' limit 1`,
  );
  const customersPermId = customersPerm[0]?.id;
  if (customersPermId) {
    await pgClient.query(`delete from public.role_permissions where role_id = $1 and permission_id = $2`, [
      adminRoleId,
      customersPermId,
    ]);
  }

  const { rows: permAfterRevoke } = await pgClient.query(
    `select p.code from public.role_permissions rp join public.permissions p on p.id = rp.permission_id where rp.role_id = $1 and p.code = 'customers.view'`,
    [adminRoleId],
  );
  step("customers.view removed from admin role (simulated review edit)", permAfterRevoke.length === 0, "still present");

  const { rows: hasPermDenied } = await pgClient.query(
    `select public.has_company_permission($1, 'customers.view') as allowed`,
    [userId],
  );
  step(
    "has_company_permission denies customers.view after role edit",
    hasPermDenied[0]?.allowed === false,
    String(hasPermDenied[0]?.allowed),
  );

  if (customersPermId) {
    await pgClient.query(
      `insert into public.role_permissions (role_id, permission_id) values ($1, $2) on conflict do nothing`,
      [adminRoleId, customersPermId],
    );
  }

  const assignBasicAgain = await superClient.rpc("assign_subscription_plan", {
    p_company_id: companyId,
    p_plan_id: basic.id,
    p_billing_cycle: "monthly",
  });
  step("downgrade to basic after approve", !assignBasicAgain.error, assignBasicAgain.error?.message ?? "ok");

  const subBasic = await readSubscription(companyId);
  step("basic persisted after downgrade", subBasic?.plan_id === basic.id, `plan_id=${subBasic?.plan_id}`);

  const { rows: basicFeatures } = await pgClient.query(
    `select pf.feature_code from public.plan_features pf where pf.plan_id = $1 order by pf.feature_code`,
    [basic.id],
  );
  step("basic plan features loaded", basicFeatures.length > 0, `${basicFeatures.length} features`);

  const assignProAfterApprove = await superClient.rpc("change_company_package_v1", {
    p_company_id: companyId,
    p_plan_id: pro.id,
    p_reason: "Upgrade basic to pro in review regression",
  });
  step("upgrade basic to pro", !assignProAfterApprove.error, assignProAfterApprove.error?.message ?? "ok");

  const subProFinal = await readSubscription(companyId);
  step("pro persisted after upgrade", subProFinal?.plan_id === pro.id, `plan_id=${subProFinal?.plan_id}`);

  report.rbac = {
    adminRoleId,
    permissionCountBefore: permBefore.length,
    hasCompanyPermissionDenied: hasPermDenied[0]?.allowed === false,
  };

  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../artifacts/login-app/.verification-screenshots");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `company-review-package-live-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);
  console.log("\nPASS company review package live verification\n");
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  const outPath = resolve(root, "scripts/_tmp-company-review-package-live.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.error("\nFAIL", report.error);
  console.error(`Report: ${outPath}`);
  process.exitCode = 1;
} finally {
  await pgClient.end().catch(() => {});
}
