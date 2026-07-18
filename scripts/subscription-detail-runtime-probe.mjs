/**
 * Subscription Detail runtime verification — mirrors React hooks against live Supabase.
 * Run: node scripts/subscription-detail-runtime-probe.mjs
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSupabaseEnv, resolveSupabaseConfig } from "./lib/supabase-env.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const productionGate = process.env.VAULTOS_PRODUCTION_GATE === "1";

const env = loadSupabaseEnv(root);
const supabaseConfig = resolveSupabaseConfig(env);
const SUPABASE_URL = supabaseConfig?.url;
const SUPABASE_KEY = supabaseConfig?.key;

const PASSWORD = "DemoVault2026!";
const PLATFORM_EMAIL = "demo-platform@vaultos.local";

const TIMELINE_EVENT_TYPES = new Set([
  "subscription_created",
  "invoice_generated",
  "payment_received",
  "subscription_activated",
  "renewed",
  "plan_changed",
  "grace_period_started",
  "expired",
  "suspended",
  "restored",
  "canceled",
  "receipt_generated",
]);

const REQUIRED_DEMO_EVENT_TYPES = [
  "subscription_created",
  "invoice_generated",
  "payment_received",
  "renewed",
  "plan_changed",
];

const checks = [];

function pass(name, detail = "") {
  checks.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  checks.push({ name, ok: false, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function probeCompany(client, company, prefix) {
  const companyId = company.id;
  pass(`${prefix} company`, `${company.name} (${company.id.slice(0, 8)}…)`);

  const { data: subscription, error: subErr } = await client
    .from("company_subscriptions")
    .select(
      `*, company:companies(id,name,logo_url,company_type,status),
       plan:plans(id,name,display_name,code,tier_rank,price_monthly,price_yearly,max_users,max_customers,storage_gb,ai_tokens_monthly,features)`,
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (subErr || !subscription) {
    fail(`${prefix} subscription summary`, subErr?.message ?? "no row");
    return;
  }
  pass(`${prefix} subscription summary`, `status=${subscription.status}, plan=${subscription.plan?.display_name ?? subscription.plan?.name}`);

  const { data: contact } = await client
    .from("company_billing_contacts")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .maybeSingle();
  pass(`${prefix} billing contact`, contact ? contact.name : "empty (valid)");

  const { data: events, error: evErr } = await client
    .from("subscription_events")
    .select("*")
    .eq("subscription_id", subscription.id)
    .order("occurred_at", { ascending: false })
    .limit(50);

  if (evErr) {
    fail(`${prefix} timeline/activity`, evErr.message);
  } else {
    const timelineCount = (events ?? []).filter((e) => TIMELINE_EVENT_TYPES.has(e.event_type)).length;
    if (timelineCount === 0) fail(`${prefix} timeline`, "empty timeline for demo company");
    else pass(`${prefix} timeline`, `${timelineCount} timeline events`);

    const eventTypes = new Set((events ?? []).map((e) => e.event_type));
    const missing = REQUIRED_DEMO_EVENT_TYPES.filter((t) => !eventTypes.has(t));
    if (missing.length > 0) fail(`${prefix} demo event coverage`, `missing: ${missing.join(", ")}`);
    else pass(`${prefix} demo event coverage`, REQUIRED_DEMO_EVENT_TYPES.join(", "));
  }

  const { data: entitlements, error: entErr } = await client.rpc("get_company_entitlements", {
    p_company_id: companyId,
  });
  if (entErr) fail(`${prefix} entitlements`, entErr.message);
  else pass(`${prefix} entitlements`, `${Array.isArray(entitlements) ? entitlements.length : 0} features`);

  const { data: audit, error: auditErr } = await client.rpc("list_billing_audit_logs_paged", {
    p_limit: 10,
    p_offset: 0,
    p_search: null,
    p_event_type: null,
    p_for_export: false,
    p_company_id: companyId,
  });

  if (auditErr) {
    if (auditErr.message.toLowerCase().includes("p_company_id")) {
      fail(`${prefix} audit (company_id filter)`, "migration 105 not applied");
    } else {
      fail(`${prefix} audit`, auditErr.message);
    }
  } else {
    const rows = audit?.rows ?? [];
    const allMatch = rows.every((r) => r.company_id === companyId);
    if (!allMatch) fail(`${prefix} audit company filter`, "rows contain other companies");
    else pass(`${prefix} audit (backend filter)`, `${rows.length} rows, total=${audit?.total ?? 0}`);
  }

  const { count, error: notErr } = await client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  if (notErr) fail(`${prefix} notifications`, notErr.message);
  else if ((count ?? 0) < 6) fail(`${prefix} notifications`, `only ${count ?? 0} rows (expected ≥6)`);
  else pass(`${prefix} notifications`, `${count} rows`);
}

async function main() {
  console.log("\nSubscription Detail Runtime Probe\n");

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    if (productionGate) {
      fail("Supabase credentials", "missing — required for production gate");
      console.log(`\n0/${checks.length} runtime checks passed.\n`);
      process.exit(1);
    }
    console.log("SKIP: No Supabase credentials (.env). Static audit only.\n");
    process.exit(0);
  }

  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: authError } = await client.auth.signInWithPassword({
    email: PLATFORM_EMAIL,
    password: PASSWORD,
  });
  if (authError) {
    fail("Platform auth", authError.message);
    process.exit(1);
  }
  pass("Platform auth", PLATFORM_EMAIL);

  const { data: demoCompanies } = await client
    .from("companies")
    .select("id,name,company_type,status,logo_url")
    .eq("company_type", "demo")
    .order("name")
    .limit(2);

  if (!demoCompanies?.length) {
    fail("Demo companies", "none found");
    process.exit(1);
  }

  for (let i = 0; i < demoCompanies.length; i++) {
    console.log(`\n— Company ${i + 1} —`);
    await probeCompany(client, demoCompanies[i], `C${i + 1}`);
  }

  const sampleCompanyId = demoCompanies[0].id;

  const { data: payOpts, error: payOptsErr } = await client.rpc("get_billing_payment_options_v1", {
    p_company_id: sampleCompanyId,
  });
  if (payOptsErr) {
    fail("Payment options RPC", payOptsErr.message.slice(0, 120));
  } else if (!payOpts?.payment_methods?.length) {
    fail("Payment options RPC", "RPC exists but returned zero methods");
  } else {
    pass("Payment options RPC", `${payOpts.payment_methods.length} methods, mode=${payOpts.active_mode}`);
  }

  const { data: plans } = await client.from("plans").select("id,code,tier_rank").eq("is_active", true);
  if ((plans ?? []).length >= 2) pass("assign_subscription_plan prerequisite", `${plans.length} active plans`);
  else fail("assign_subscription_plan prerequisite", "need ≥2 plans for plan change");

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} runtime checks passed.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
