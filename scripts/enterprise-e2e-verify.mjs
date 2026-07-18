/**
 * Enterprise E2E verification against linked Supabase (demo personas).
 * Run: node scripts/enterprise-e2e-verify.mjs
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const paths = [
    resolve(root, "artifacts/login-app/.env.local"),
    resolve(root, ".env"),
  ];
  const env = {};
  for (const p of paths) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL =
  env.VITE_SUPABASE_URL || env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase URL or publishable key in .env / .env.local");
  process.exit(2);
}

const PASSWORD = "DemoVault2026!";
const PERSONAS = {
  platform_owner: { email: "demo-platform@vaultos.local", label: "Platform Owner" },
  company_admin: { email: "demo-beta-admin@vaultos.local", label: "Company Admin" },
  finance_manager: { email: "demo-finance@vaultos.local", label: "Finance Manager" },
  employee: { email: "demo-employee@vaultos.local", label: "Employee" },
};

const results = [];

function record(category, test, pass, detail = "") {
  results.push({ category, test, pass, detail });
  const icon = pass ? "PASS" : "FAIL";
  console.log(`[${icon}] ${category} :: ${test}${detail ? ` — ${detail}` : ""}`);
}

async function signIn(email) {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return client;
}

async function rpcExpect(client, fn, args, { shouldFail = false, messageIncludes = null } = {}) {
  const { data, error } = await client.rpc(fn, args ?? {});
  if (shouldFail) {
    if (error) return { ok: true, error: error.message, data: null };
    return { ok: false, error: "Expected failure but RPC succeeded", data };
  }
  if (error) return { ok: false, error: error.message, data: null };
  if (messageIncludes && JSON.stringify(data ?? "").indexOf(messageIncludes) < 0) {
    return { ok: false, error: `Missing expected fragment: ${messageIncludes}`, data };
  }
  return { ok: true, error: null, data };
}

async function verifyPersonaAuth() {
  for (const [key, persona] of Object.entries(PERSONAS)) {
    try {
      const client = await signIn(persona.email);
      const { data: user } = await client.auth.getUser();
      record("Persona Auth", persona.label, !!user?.user?.email, user?.user?.email ?? "");
    } catch (e) {
      record("Persona Auth", persona.label, false, e.message);
    }
  }
}

async function verifyDemoEnvironment(platform) {
  const { data, error } = await platform
    .from("companies")
    .select("id,name")
    .eq("company_type", "demo");
  record(
    "Demo Environment",
    "Demo companies seeded (>=5)",
    !error && Array.isArray(data) && data.length >= 5,
    error?.message ?? `count=${data?.length ?? 0}`,
  );

  const { data: payments } = await platform
    .from("billing_payments")
    .select("id,status")
    .eq("provider_payment_id", "demo_pay_beta_failed_001");
  record(
    "Demo Environment",
    "Beta failed payment scenario",
    Array.isArray(payments) && payments.length === 1 && payments[0].status === "failed",
    `rows=${payments?.length ?? 0}`,
  );

  const { data: users } = await platform.auth.admin?.listUsers?.();
  // publishable key cannot list users — use profiles instead
  const { data: profiles, error: pErr } = await platform
    .from("profiles")
    .select("id,full_name,is_super_admin")
    .ilike("full_name", "DEMO%");
  record(
    "Demo Environment",
    "Demo profiles present (>=5)",
    !pErr && Array.isArray(profiles) && profiles.length >= 5,
    pErr?.message ?? `count=${profiles?.length ?? 0}`,
  );
}

async function verifyPlatformBilling(platform) {
  const payments = await rpcExpect(platform, "list_billing_payments_paged_v1", {
    p_limit: 10,
    p_offset: 0,
    p_search: "Demo Beta",
    p_status: "all",
  });
  record(
    "Platform Billing Center",
    "list_billing_payments_paged_v1",
    payments.ok && (payments.data?.total ?? 0) >= 1,
    payments.error ?? `total=${payments.data?.total ?? 0}`,
  );

  const revenue = await rpcExpect(platform, "get_billing_revenue_metrics_v1");
  record(
    "Platform Billing Center",
    "get_billing_revenue_metrics_v1",
    revenue.ok && revenue.data?.schema_version === 1,
    revenue.error ?? `mrr=${revenue.data?.mrr ?? "n/a"}`,
  );

  const failures = await rpcExpect(platform, "list_billing_payment_failures_paged_v1", {
    p_limit: 10,
    p_offset: 0,
    p_search: null,
  });
  record(
    "Platform Billing Center",
    "list_billing_payment_failures_paged_v1",
    failures.ok && (failures.data?.total ?? 0) >= 1,
    failures.error ?? `total=${failures.data?.total ?? 0}`,
  );

  const health = await rpcExpect(platform, "get_payment_provider_health_v1");
  record(
    "Platform Billing Center",
    "get_payment_provider_health_v1",
    health.ok && Array.isArray(health.data?.providers),
    health.error ?? `providers=${health.data?.providers?.length ?? 0}`,
  );
}

async function verifyWorkspace(client, label, { manage = false } = {}) {
  const access = await rpcExpect(client, "can_access_workspace");
  record("Workspace Access", `${label} can_access_workspace`, access.ok && access.data === true, access.error ?? "");

  const summary = await rpcExpect(client, "get_workspace_billing_summary_v1");
  record(
    "Workspace Access",
    `${label} get_workspace_billing_summary_v1`,
    summary.ok && summary.data?.schema_version === 1 && summary.data?.company_id,
    summary.error ?? summary.data?.company?.name ?? "",
  );

  const manageBilling = await rpcExpect(client, "can_manage_own_billing");
  record(
    "RBAC",
    `${label} can_manage_own_billing=${manage}`,
    manageBilling.ok && manageBilling.data === manage,
    manageBilling.error ?? String(manageBilling.data),
  );
}

async function verifyRbacDenials(employee, platformAsEmployee) {
  const denied = await rpcExpect(employee, "list_billing_payments_paged_v1", {
    p_limit: 5,
    p_offset: 0,
  }, { shouldFail: true });
  record(
    "RBAC",
    "Employee denied platform payments list",
    denied.ok,
    denied.error ?? "",
  );

  const deniedRevenue = await rpcExpect(employee, "get_billing_revenue_metrics_v1", {}, { shouldFail: true });
  record(
    "RBAC",
    "Employee denied revenue metrics",
    deniedRevenue.ok,
    deniedRevenue.error ?? "",
  );
}

async function verifyNotificationBus(platform, admin) {
  const { data: catalog } = await platform
    .from("billing_event_catalog")
    .select("code")
    .eq("is_active", true)
    .limit(1);
  record(
    "Notification Bus",
    "billing_event_catalog active entries",
    Array.isArray(catalog) && catalog.length >= 1,
    `entries=${catalog?.length ?? 0}`,
  );

  const publish = await rpcExpect(admin, "notification_bus_publish_v1", {
    p_event_code: "financial.payment.succeeded",
    p_company_id: "d0000010-0001-4001-8001-000000000002",
    p_payload: { demo_e2e: true, amount: 99 },
    p_idempotency_key: `e2e-${Date.now()}`,
  });
  record(
    "Notification Bus",
    "notification_bus_publish_v1 (company admin)",
    publish.ok && !!publish.data,
    publish.error ?? `event_id=${publish.data ?? "none"}`,
  );

  if (publish.ok && publish.data) {
    const { data: events } = await platform
      .from("billing_notification_events")
      .select("id,status")
      .eq("id", publish.data)
      .maybeSingle();
    record(
      "Notification Bus",
      "Event persisted in billing_notification_events",
      !!events?.id,
      events?.status ?? "",
    );

    const { data: notif } = await admin
      .from("notifications")
      .select("id,title")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    record(
      "Notification Bus",
      "In-app subscriber created notification",
      !!notif?.id,
      notif?.title ?? "",
    );
  }
}

async function verifySandbox(platform) {
  const { data, error } = await platform
    .from("billing_settings")
    .select("value")
    .eq("definition_code", "payment_sandbox_mode")
    .eq("scope_type", "platform")
    .is("scope_id", null)
    .maybeSingle();
  const enabled = data?.value === true || data?.value === "true" || data?.value?.toString?.() === "true";
  record(
    "Sandbox Mode",
    "payment_sandbox_mode platform=true",
    !error && enabled,
    error?.message ?? JSON.stringify(data?.value),
  );

  const { data: provider } = await platform
    .from("payment_providers")
    .select("code,is_active,display_name")
    .eq("code", "sandbox")
    .maybeSingle();
  record(
    "Sandbox Mode",
    "sandbox provider active",
    provider?.is_active === true,
    provider?.display_name ?? "",
  );
}

async function verifyAnalytics(platform) {
  const compute = await rpcExpect(platform, "financial_compute_analytics_snapshot_v1", {
    p_snapshot_date: new Date().toISOString().slice(0, 10),
  });
  record(
    "Analytics",
    "financial_compute_analytics_snapshot_v1",
    compute.ok && compute.data?.schema_version === 1,
    compute.error ?? `mrr=${compute.data?.mrr ?? "n/a"}`,
  );

  const { data: snap, error } = await platform
    .from("financial_analytics_snapshots")
    .select("snapshot_date,metrics")
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  record(
    "Analytics",
    "financial_analytics_snapshots row exists",
    !error && !!snap?.metrics,
    error?.message ?? `date=${snap?.snapshot_date ?? "none"}`,
  );
}

async function verifyBackwardCompatibility(platform) {
  const legacy = await rpcExpect(platform, "list_company_subscriptions_paged", {
    p_limit: 10,
    p_offset: 0,
    p_search: "DEMO",
    p_status: "all",
    p_billing_cycle: null,
    p_sort_by: "renewal",
    p_sort_dir: "desc",
  });
  record(
    "Backward Compatibility",
    "list_company_subscriptions_paged (Phase A RPC)",
    legacy.ok && (legacy.data?.total ?? 0) >= 5,
    legacy.error ?? `total=${legacy.data?.total ?? 0}`,
  );

  const audit = await rpcExpect(platform, "list_billing_audit_logs_paged", {
    p_limit: 5,
    p_offset: 0,
    p_search: null,
    p_event_type: null,
    p_for_export: false,
  });
  record(
    "Backward Compatibility",
    "list_billing_audit_logs_paged",
    audit.ok,
    audit.error ?? `total=${audit.data?.total ?? 0}`,
  );
}

async function main() {
  console.log("Enterprise E2E Verification");
  console.log(`Target: ${SUPABASE_URL}`);
  console.log("---");

  await verifyPersonaAuth();

  let platform;
  let admin;
  let finance;
  let employee;
  try {
    platform = await signIn(PERSONAS.platform_owner.email);
    admin = await signIn(PERSONAS.company_admin.email);
    finance = await signIn(PERSONAS.finance_manager.email);
    employee = await signIn(PERSONAS.employee.email);
  } catch (e) {
    console.error("Fatal sign-in failure:", e.message);
    process.exit(1);
  }

  await verifyDemoEnvironment(platform);
  await verifyPlatformBilling(platform);
  await verifyWorkspace(admin, PERSONAS.company_admin.label, { manage: true });
  await verifyWorkspace(finance, PERSONAS.finance_manager.label, { manage: true });
  await verifyWorkspace(employee, PERSONAS.employee.label, { manage: false });
  await verifyRbacDenials(employee);
  await verifyNotificationBus(platform, admin);
  await verifySandbox(platform);
  await verifyAnalytics(platform);
  await verifyBackwardCompatibility(platform);

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log("---");
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`);

  const reportPath = resolve(root, "docs/architecture/enterprise-e2e-verification-report.md");
  const lines = [
    "# Enterprise E2E Verification Report",
    "",
    `**Date:** ${new Date().toISOString()}`,
    `**Target:** ${SUPABASE_URL}`,
    `**Migrations applied:** 047, 048, 049, 050, 099 (+ repair 100)`,
    "",
    "## Deployment Notes",
    "",
    "| Migration | Result | Notes |",
    "|-----------|--------|-------|",
    "| 047 | PASS (after fix) | Initial push failed: missing `END IF` in `is_feature_enabled()`; fixed and re-pushed |",
    "| 048 | PASS | Analytics snapshots |",
    "| 049 | PASS | In-app notification subscriber |",
    "| 050 | PASS | Bus emit + RBAC seeds |",
    "| 099 | PARTIAL | Recorded on remote; DO block rolled back due to profile/company FK order + broad exception handler |",
    "| 100 | PASS | Demo seed repair (company order, subscription_status, triggers, role names) |",
    "",
    "## Results",
    "",
    "| Category | Test | Result | Detail |",
    "|----------|------|--------|--------|",
    ...results.map(
      (r) => `| ${r.category} | ${r.test} | ${r.pass ? "**PASS**" : "**FAIL**"} | ${String(r.detail).replace(/\|/g, "\\|")} |`,
    ),
    "",
    "## Summary",
    "",
    `- **Passed:** ${passed}`,
    `- **Failed:** ${failed}`,
    `- **Release recommendation:** ${failed === 0 ? "Proceed to Release Review (Phase C not authorized until approved)" : "Block — remediate failures before Release Review"}`,
    "",
    "## Phase C Status",
    "",
    "**NOT AUTHORIZED** — awaiting successful Enterprise E2E and Release Review approval.",
    "",
  ];

  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(resolve(root, "docs/architecture"), { recursive: true });
  writeFileSync(reportPath, lines.join("\n"), "utf8");
  console.log(`Report written: ${reportPath}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
