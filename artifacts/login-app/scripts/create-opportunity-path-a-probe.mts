/**
 * Path A probe: create opportunity when none exists.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const env: Record<string, string> = {};
for (const line of readFileSync(resolve(projectRoot, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || "";

const LEAD_ID = "7910a2b8-ff3e-46ee-9137-04e636fc8dea";

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
const { executeLeadTableAction } = await import("../src/components/leads/crm/leads-crm-action-handler.ts");

const { data: lead, error } = await supabase
  .from("leads")
  .select("id, company_id, title, contact_name, customer_id, is_qualified, lifecycle_status, assigned_user_id")
  .eq("id", LEAD_ID)
  .maybeSingle();
if (error || !lead) throw error ?? new Error("lead missing");

const before = await serviceSb
  .from("opportunities")
  .select("id")
  .eq("lead_id", LEAD_ID)
  .is("deleted_at", null);
if ((before.data ?? []).length > 0) {
  console.log("SKIP path A: opportunity already exists", before.data);
  process.exit(0);
}

const companyId = String(lead.company_id);
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

let openedId: string | null = null;
await executeLeadTableAction("createOpportunity", {
  row: {
    id: lead.id,
    tenantId: companyId,
    name: lead.title ?? "Lead",
    contactPerson: lead.contact_name ?? "",
    companyName: null,
    stage: "qualified",
    stageId: "",
    lifecycleStatus: lead.lifecycle_status ?? "qualified",
    owner: "",
    ownerId: lead.assigned_user_id,
    source: "",
    priority: "normal",
    expectedValue: 0,
    currency: "SAR",
    email: null,
    phone: null,
    customerId: lead.customer_id,
    tags: [],
    notes: "",
    temperature: null,
    score: 0,
    expectedCloseDate: null,
    lastActivityAt: null,
    createdAt: new Date().toISOString(),
    pipelineId: "",
    isQualified: Boolean(lead.is_qualified),
  },
  t: (k) => k,
  toast: () => {},
  failToast: (title, err) => {
    throw err instanceof Error ? err : new Error(`${title}:${String(err)}`);
  },
  commands: { convert: { mutateAsync: async () => ({}) }, archive: { mutateAsync: async () => ({}) } },
  opportunityCommands: {
    createFromLead: {
      mutateAsync: async (input) =>
        unwrapCommandResult(await services.opportunity.createFromLead(input, context)),
    },
  },
  openLead360: () => {},
  setOpportunityId: (id) => {
    openedId = id;
  },
  setEditLead: () => {},
  setEditOpen: () => {},
  setActionLead: () => {},
  setAssignOpen: () => {},
  setActivityOpen: () => {},
  setDeleteOpen: () => {},
  setSelectedLead: () => {},
  whatsApp: {
    hasIntegration: false,
    channelId: null,
    companyId,
    openPlatform: async () => {},
  },
});

const after = await serviceSb
  .from("opportunities")
  .select("id, lead_id, name")
  .eq("lead_id", LEAD_ID)
  .is("deleted_at", null)
  .maybeSingle();

console.log(
  JSON.stringify(
    {
      outcome: "A_created_opportunity",
      openedId,
      dbRow: after.data,
      success: Boolean(openedId && after.data?.id === openedId),
    },
    null,
    2,
  ),
);

if (!openedId || after.data?.id !== openedId) process.exit(1);
console.log("PROBE_SUCCESS path A");
