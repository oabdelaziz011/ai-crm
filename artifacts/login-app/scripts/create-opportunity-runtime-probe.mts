/**
 * Runtime probe: Lead Table → Create Opportunity full stack (authenticated).
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
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const probeEmail = "demo-platform@vaultos.local";
const probePassword = "DemoVault2026!";

if (!serviceUrl || !serviceKey || !publishableKey) {
  console.error("PROBE_FAIL missing Supabase env");
  process.exit(1);
}

function checkpoint(name: string, detail?: unknown) {
  console.log(`CHECKPOINT_OK ${name}${detail != null ? ` ${JSON.stringify(detail)}` : ""}`);
}

function fail(name: string, error: unknown): never {
  console.error(`PROBE_FAIL at ${name}`);
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const serviceSb = createClient(serviceUrl, serviceKey, { auth: { persistSession: false } });

const { supabase } = await import("../src/lib/supabase.ts");
const signIn = await supabase.auth.signInWithPassword({ email: probeEmail, password: probePassword });
if (signIn.error) fail("auth.signInWithPassword", signIn.error);
checkpoint("auth.signInWithPassword", { userId: signIn.data.user?.id, email: probeEmail });

const { buildApplicationContext, createLoginAppApplicationLayerRegistry } = await import(
  "../src/lib/application-layer/application-layer-bootstrap.ts"
);
const { unwrapCommandResult } = await import("../src/lib/application-layer/application-layer-result.ts");
const { executeLeadTableAction, routeForLeadTableAction } = await import(
  "../src/components/leads/crm/leads-crm-action-handler.ts"
);
const { routeLeadTableAction } = await import("../src/components/leads/crm/leads-crm-action-routes.ts");

type LeadProbeRow = {
  id: string;
  company_id: string;
  title: string | null;
  contact_name: string | null;
  customer_id: string | null;
  is_qualified: boolean | null;
  assigned_user_id: string | null;
  lifecycle_status: string | null;
};

const { data: visibleLeads, error: visibleError } = await supabase
  .from("leads")
  .select("id, company_id, title, contact_name, customer_id, is_qualified, assigned_user_id, lifecycle_status")
  .is("deleted_at", null)
  .not("customer_id", "is", null)
  .order("updated_at", { ascending: false })
  .limit(10);

if (visibleError) fail("auth.listLeads", visibleError);

let leadRows = visibleLeads as LeadProbeRow[] | null;
if (!leadRows?.length) {
  const fallback = await supabase
    .from("leads")
    .select("id, company_id, title, contact_name, customer_id, is_qualified, assigned_user_id, lifecycle_status")
    .is("deleted_at", null)
    .eq("is_qualified", true)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (fallback.error) fail("auth.listQualifiedLeads", fallback.error);
  leadRows = fallback.data as LeadProbeRow[] | null;
}

if (!leadRows?.length) fail("auth.listLeads", new Error("No leads visible to authenticated user"));

const lead = leadRows[0]!;
checkpoint("auth.selectedLead", {
  leadId: lead.id,
  companyId: lead.company_id,
  customerId: lead.customer_id,
  lifecycleStatus: lead.lifecycle_status,
});

const companyId = String(lead.company_id);
const actorUserId = String(signIn.data.user!.id);

const snapshotProbe = await supabase
  .from("leads")
  .select("id, title, contact_name, customer_id, is_qualified")
  .eq("company_id", companyId)
  .eq("id", lead.id)
  .is("deleted_at", null)
  .maybeSingle();
if (snapshotProbe.error) fail("auth.getLeadSnapshotProbe", snapshotProbe.error);
if (!snapshotProbe.data) fail("auth.getLeadSnapshotProbe", new Error("Lead not visible via publishable client"));
checkpoint("auth.getLeadSnapshotProbe", snapshotProbe.data);

const route = routeLeadTableAction("createOpportunity");
checkpoint("routeLeadTableAction", route);
checkpoint("routeForLeadTableAction", routeForLeadTableAction("createOpportunity"));

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
let opportunityIdFromCommand: string | null = null;

try {
  const result = await services.opportunity.createFromLead(
    { leadId: String(lead.id), name: lead.title || lead.contact_name || undefined },
    context,
  );
  checkpoint("applicationLayer.createFromLead.envelope", {
    hasData: Boolean(result?.data),
    correlationId: result?.correlationId,
  });
  const opportunity = unwrapCommandResult(result);
  if (!opportunity?.id) fail("unwrapCommandResult", new Error("Missing opportunity.id"));
  opportunityIdFromCommand = opportunity.id;
  checkpoint("unwrapCommandResult", { opportunityId: opportunity.id });
} catch (error) {
  fail("applicationLayer.createFromLead", error);
}

const { data: oppRow } = await serviceSb
  .from("opportunities")
  .select("id, lead_id, company_id")
  .eq("company_id", companyId)
  .eq("lead_id", lead.id)
  .is("deleted_at", null)
  .maybeSingle();
checkpoint("supabase.opportunityRow", oppRow ?? null);

const row = {
  id: String(lead.id),
  tenantId: companyId,
  name: String(lead.title ?? lead.contact_name ?? "Lead"),
  contactPerson: String(lead.contact_name ?? ""),
  companyName: null,
  stage: "converted",
  stageId: "",
  lifecycleStatus: lead.lifecycle_status ?? "converted",
  owner: "",
  ownerId: lead.assigned_user_id ? String(lead.assigned_user_id) : null,
  source: "",
  priority: "normal",
  expectedValue: 0,
  currency: "SAR",
  email: null,
  phone: null,
  customerId: lead.customer_id ? String(lead.customer_id) : null,
  tags: [],
  notes: "",
  temperature: null,
  score: 0,
  expectedCloseDate: null,
  lastActivityAt: null,
  createdAt: new Date().toISOString(),
  pipelineId: "",
  isQualified: Boolean(lead.is_qualified),
};

let openedOpportunityId: string | null = null;
const errors: string[] = [];
const toasts: string[] = [];

async function runCreateFromLeadMutation(input: { leadId: string; name?: string }) {
  checkpoint("menu.createOpportunity.invoke", input);
  const result = await services.opportunity.createFromLead(input, context);
  return unwrapCommandResult(result);
}

try {
  checkpoint("executeLeadTableAction.enter", { action: "createOpportunity" });
  await executeLeadTableAction("createOpportunity", {
    row,
    t: (key) => key,
    toast: ({ title }) => {
      toasts.push(title);
    },
    failToast: (title, error) => {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Unknown error";
      errors.push(`${title}:${message}`);
    },
    commands: {
      convert: { mutateAsync: async () => ({}) },
      archive: { mutateAsync: async () => ({}) },
    },
    opportunityCommands: {
      createFromLead: { mutateAsync: runCreateFromLeadMutation },
    },
    openLead360: () => {},
    setOpportunityId: (id) => {
      openedOpportunityId = id;
      checkpoint("opportunity360.open", { id });
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
} catch (error) {
  fail("executeLeadTableAction", error);
}

if (errors.length) fail("executeLeadTableAction.failToast", new Error(errors.join(" | ")));
if (!openedOpportunityId) fail("opportunity360.open", new Error("Opportunity360 id not set"));
if (openedOpportunityId !== opportunityIdFromCommand) {
  fail(
    "opportunityIdConsistency",
    new Error(`handler=${openedOpportunityId} command=${opportunityIdFromCommand}`),
  );
}

console.log(
  JSON.stringify(
    {
      outcome: oppRow ? "B_existing_opportunity" : "A_created_opportunity",
      leadId: lead.id,
      opportunityId: openedOpportunityId,
      toasts,
      errors,
    },
    null,
    2,
  ),
);

console.log("PROBE_SUCCESS Create Opportunity runtime flow completed");
