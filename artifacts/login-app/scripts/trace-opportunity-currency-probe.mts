/**
 * Trace opportunity currency: DB → read model → formatOpportunityMoney
 * Usage: npx tsx scripts/trace-opportunity-currency-probe.mts [opportunityId]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const env: Record<string, string> = {};
for (const p of [resolve(projectRoot, ".env"), resolve(projectRoot, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

process.env.VITE_SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.SUPABASE_PUBLISHABLE_KEY ||
  "";

const serviceUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const probeEmail = "demo-platform@vaultos.local";
const probePassword = "DemoVault2026!";
const cliOpportunityId = process.argv[2]?.trim() || null;

if (!serviceUrl || !serviceKey) {
  console.error("PROBE_FAIL missing Supabase env");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const serviceSb = createClient(serviceUrl, serviceKey, { auth: { persistSession: false } });

const { supabase } = await import("../src/lib/supabase.ts");
const signIn = await supabase.auth.signInWithPassword({ email: probeEmail, password: probePassword });
if (signIn.error) {
  console.error("PROBE_FAIL auth", signIn.error.message);
  process.exit(1);
}

const actorUserId = signIn.data.user!.id;

// Resolve company for demo user
const { data: profile } = await serviceSb
  .from("profiles")
  .select("company_id")
  .eq("user_id", actorUserId)
  .maybeSingle();
const companyId = profile?.company_id ? String(profile.company_id) : null;

// Company billing default
let companyDefaultCurrency: string | null = null;
if (companyId) {
  const { data: billing } = await serviceSb
    .from("platform_billing_settings")
    .select("default_currency")
    .eq("company_id", companyId)
    .maybeSingle();
  companyDefaultCurrency = billing?.default_currency ? String(billing.default_currency) : null;
}

// Pick opportunity: CLI arg, else most recently updated
let opportunityId = cliOpportunityId;
if (!opportunityId) {
  let q = serviceSb
    .from("opportunities")
    .select("id, name, currency, updated_at, created_from_lead, lead_id, created_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (companyId) q = q.eq("company_id", companyId);
  const { data: recent, error } = await q;
  if (error) {
    console.error("PROBE_FAIL list opportunities", error.message);
    process.exit(1);
  }
  console.log("RECENT_OPPORTUNITIES", JSON.stringify(recent, null, 2));
  opportunityId = recent?.[0]?.id ? String(recent[0].id) : null;
}

if (!opportunityId) {
  console.error("PROBE_FAIL no opportunity found");
  process.exit(1);
}

// 1) Direct DB read (service role)
const { data: dbRow, error: dbError } = await serviceSb
  .from("opportunities")
  .select(
    "id, company_id, name, currency, expected_revenue, weighted_revenue, created_from_lead, lead_id, created_at, updated_at, metadata",
  )
  .eq("id", opportunityId)
  .maybeSingle();
if (dbError || !dbRow) {
  console.error("PROBE_FAIL db read", dbError?.message ?? "not found");
  process.exit(1);
}

console.log("\n=== DATABASE (service role) ===");
console.log("opportunity_id:", dbRow.id);
console.log("opportunities.currency:", dbRow.currency);

// Creation path inference
let creationPath = "unknown";
if (dbRow.created_from_lead) {
  creationPath = "createFromLead";
  if (dbRow.lead_id) {
    const { data: leadRow } = await serviceSb
      .from("leads")
      .select("id, currency, estimated_value, title")
      .eq("id", dbRow.lead_id)
      .maybeSingle();
    console.log("lead_id:", dbRow.lead_id);
    console.log("leads.currency (at trace time):", leadRow?.currency ?? null);
  }
} else {
  creationPath = "createManual";
}

// History creation event
const { data: historyRows } = await serviceSb
  .from("opportunity_history")
  .select("event_type, created_at, actor_user_id, summary")
  .eq("opportunity_id", opportunityId)
  .order("created_at", { ascending: true })
  .limit(5);
console.log("first_history_events:", historyRows);

// 2) Application layer read model (same path as Opportunity360)
const { buildApplicationContext, createLoginAppApplicationLayerRegistry } = await import(
  "../src/lib/application-layer/application-layer-bootstrap.ts"
);
const { unwrapQueryResult } = await import("../src/lib/application-layer/application-layer-result.ts");
const { mapOpportunityRecordToReadModel } = await import(
  "../src/lib/opportunity-platform/map-opportunity-record.ts"
);
const { createLoginAppOpportunityPlatformServices } = await import(
  "../src/lib/opportunity-platform/opportunity-platform-factory.ts"
);
const { formatOpportunityMoney } = await import("../src/components/opportunities/opportunity360-ui.tsx");

const tenantId = String(dbRow.company_id);
const registry = createLoginAppApplicationLayerRegistry({
  companyId: tenantId,
  actorUserId,
  isSuperAdmin: true,
  hasPermission: () => true,
});
const context = buildApplicationContext({
  tenantId,
  actorId: actorUserId,
  permissions: ["*"],
});

const appResult = await registry.getServices().opportunity.getOpportunity(opportunityId, context);
const readModel = unwrapQueryResult(appResult);

// Raw platform record (before UI mapper)
const platform = createLoginAppOpportunityPlatformServices(supabase);
const platformRecord = await platform.queries.getById(
  { userId: actorUserId, companyId: tenantId, isSuperAdmin: true, hasPermission: () => true },
  tenantId,
  opportunityId,
);

console.log("\n=== PLATFORM RECORD (repository map) ===");
console.log("record.currency:", platformRecord?.currency ?? null);

const mappedViaAdapter = platformRecord
  ? await mapOpportunityRecordToReadModel(supabase, tenantId, platformRecord)
  : null;

console.log("\n=== OpportunityReadModel (UI workspace query) ===");
console.log("OpportunityReadModel.currency:", readModel?.currency ?? null);
console.log("mappedViaAdapter.currency:", mappedViaAdapter?.currency ?? null);

// 3) Formatter output (what header/smart-rail/overview would show)
const expectedRevenue = readModel?.expectedRevenue ?? null;
const weightedRevenue = readModel?.weightedRevenue ?? null;
const formattedExpected = formatOpportunityMoney(expectedRevenue, readModel?.currency);
const formattedWeighted = formatOpportunityMoney(weightedRevenue, readModel?.currency);

console.log("\n=== formatOpportunityMoney() ===");
console.log("input.currency:", readModel?.currency ?? null);
console.log("formatOpportunityMoney(expectedRevenue):", formattedExpected);
console.log("formatOpportunityMoney(weightedRevenue):", formattedWeighted);

console.log("\n=== CONTEXT ===");
console.log("company_id:", tenantId);
console.log("company_default_currency:", companyDefaultCurrency);
console.log("inferred_creation_path:", creationPath);
console.log("db_currency_is_USD:", String(dbRow.currency).toUpperCase() === "USD");
console.log("db_currency_is_EGP:", String(dbRow.currency).toUpperCase() === "EGP");
console.log("ui_would_show_USD_symbol:", /\$|USD/.test(formattedExpected));
console.log("ui_would_show_EGP:", /EGP|E£|ج\.م/.test(formattedExpected));

if (String(dbRow.currency).toUpperCase() === "USD") {
  console.log("\n=== USD ROOT CAUSE (creation path) ===");
  console.log(
    JSON.stringify(
      {
        creationPath,
        created_from_lead: dbRow.created_from_lead,
        lead_id: dbRow.lead_id,
        created_at: dbRow.created_at,
        note:
          creationPath === "createManual"
            ? "Manual create before company-currency seeding, or explicit USD on insert"
            : "Lead conversion: check leads.currency at conversion time and resolveLeadOpportunityCurrency rules",
      },
      null,
      2,
    ),
  );
}

if (
  String(dbRow.currency).toUpperCase() === "EGP" &&
  /\$|USD/.test(formattedExpected)
) {
  console.log("\n=== MISMATCH: DB=EGP but formatter shows USD ===");
  console.log("Investigate formatter override — this should not happen with formatOpportunityMoney");
}

console.log("\nPROBE_SUCCESS");
