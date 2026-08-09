/**
 * API verification for Sprint 4.6 enterprise create form contract.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLeadOpportunityFormSeed,
  opportunityFormDraftToCreateFromLeadInput,
  opportunityFormDraftToManualCreateInput,
  type OpportunityStageOption,
} from "../src/components/opportunities/opportunity-form-draft.ts";

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

process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || "";

const { createClient } = await import("@supabase/supabase-js");
const serviceSb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const { supabase } = await import("../src/lib/supabase.ts");
const signIn = await supabase.auth.signInWithPassword({
  email: "demo-platform@vaultos.local",
  password: "DemoVault2026!",
});
if (signIn.error) throw signIn.error;

const { buildApplicationContext, createLoginAppApplicationLayerRegistry } = await import(
  "../src/lib/application-layer/application-layer-bootstrap.ts"
);
const { unwrapCommandResult } = await import("../src/lib/application-layer/application-layer-result.ts");
const { getCompanyCurrency } = await import("../src/lib/company-locale/runtime.ts");

const companyId = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const actorUserId = String(signIn.data.user!.id);
const registry = createLoginAppApplicationLayerRegistry({
  companyId,
  actorUserId,
  isSuperAdmin: true,
  hasPermission: () => true,
});
const context = buildApplicationContext({
  tenantId: companyId,
  actorId: actorUserId,
  permissions: ["*"],
});
const services = registry.getServices();

const { data: stages } = await serviceSb
  .from("opportunity_stages")
  .select("id,name,default_probability_percent,sort_order")
  .eq("company_id", companyId)
  .order("sort_order");
const stageById = new Map<string, OpportunityStageOption>(
  (stages ?? []).map((stage) => [
    String(stage.id),
    {
      id: String(stage.id),
      label: String(stage.name),
      defaultProbabilityPercent: Number(stage.default_probability_percent ?? 0),
    },
  ]),
);
const firstStage = stages?.[0];
const { data: pipeline } = await serviceSb
  .from("opportunity_pipelines")
  .select("id")
  .eq("company_id", companyId)
  .eq("is_default", true)
  .maybeSingle();

const draft = buildLeadOpportunityFormSeed(
  {
    id: "00000000-0000-0000-0000-000000000099",
    name: "Sprint Verify Lead",
    contactPerson: "Verify Contact",
    companyName: "Verify Corp",
    email: "verify@example.com",
    phone: "+201111111111",
    whatsapp: "+201111111111",
    leadSource: "Website",
    customerId: "275b67bd-7360-4841-8b78-4ece64733d65",
    customerName: "Verify Contact",
    ownerId: actorUserId,
    expectedValue: 75000,
    currency: "EGP",
    expectedCloseDate: "2026-12-31",
    stage: "Qualified",
    ai: { score: 82, winProbability: 55, suggestedNextStep: "Send proposal", suggestedStage: "Proposal" },
  },
  {
    companyCurrency: getCompanyCurrency(),
    defaultOwnerUserId: actorUserId,
    defaultStageId: String(firstStage?.id ?? ""),
    defaultPipelineId: String(pipeline?.id ?? ""),
    defaultProbabilityPercent: Number(firstStage?.default_probability_percent ?? 10),
  },
);

draft.name = `Sprint 4.6 API Verify ${Date.now()}`;
draft.expectedRevenue = "75000";
draft.expectedCloseDate = "2026-12-31";
draft.priority = "high";
draft.probabilityMode = "manual";
draft.probabilityPercent = "42";
draft.tags = ["enterprise", "sprint-4.6"];
draft.notes = "Created via API verification probe";

const payload = opportunityFormDraftToManualCreateInput(draft, stageById);
const created = unwrapCommandResult(await services.opportunity.createOpportunity(payload, context));

const { data: history } = await serviceSb
  .from("opportunity_history")
  .select("event_type,summary,created_at")
  .eq("opportunity_id", created.id)
  .order("created_at", { ascending: false })
  .limit(5);

console.log(
  JSON.stringify(
    {
      opportunity: {
        id: created.id,
        name: created.name,
        currency: created.currency,
        probabilityPercent: created.probabilityPercent,
        probabilitySource: created.probabilitySource,
      },
      history,
      stageSource: (stages ?? []).map((s) => s.name),
    },
    null,
    2,
  ),
);
