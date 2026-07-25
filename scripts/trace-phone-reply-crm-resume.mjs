/** Complete CRM-enabled resume from run that already has customer_phone stored. */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { AutomationEngine } from "../lib/automation-platform/src/engine/automation-engine.ts";
import { AutomationNodeRegistry } from "../lib/automation-platform/src/engine/node-registry.ts";
import { createBuiltInAutomationNodeHandlers } from "../lib/automation-platform/src/engine/built-in-nodes.ts";
import {
  createSupabaseAutomationFlowRepository,
  createSupabaseAutomationRunRepository,
  createSupabaseConversationSessionRepository,
} from "../lib/automation-platform/src/repositories/supabase-automation-repositories.ts";
import { createSupabaseAutomationFlowVersionRepository } from "../lib/automation-platform/src/lifecycle/supabase-version-repository.ts";
import { createSupabaseAutomationFlowVersionGraphRepository } from "../lib/automation-platform/src/lifecycle/supabase-version-graph-repository.ts";
import { DefaultCustomerServicePort } from "../lib/automation-platform/src/ports/customer-service-port.ts";
import { SupabaseCustomerRepository } from "../artifacts/login-app/src/lib/crm/supabase-customer-repository.ts";
import { buildResumeInput } from "../lib/automation-platform/src/orchestrator/session-policy.ts";
import { buildActionVariableScope, resolveFieldBindingAsString } from "../lib/automation-platform/src/field-binding/resolver.ts";
import { normalizeFindCustomerConfig } from "../lib/automation-platform/src/crm/find-customer-config.ts";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const RUN_ID = process.argv[2] ?? "7d0d2754-81cf-4b44-946f-8c0a75c53914";
const PHONE = "+201234567890";
const DEMO_PASSWORD = "DemoVault2026!";
const PLATFORM_OWNER = "demo-platform@vaultos.local";

const { data: auth } = await sb.auth.signInWithPassword({ email: PLATFORM_OWNER, password: DEMO_PASSWORD });
const userId = auth.user?.id;
if (!userId) throw new Error("Auth failed");
const ctx = { userId, companyId: null, isSuperAdmin: true, hasPermission: () => true };

const { data: runBefore } = await sb.from("automation_runs").select("*").eq("id", RUN_ID).single();
if (!runBefore) throw new Error("Run not found");
ctx.companyId = runBefore.company_id;

const { data: findNode } = await sb
  .from("automation_flow_version_nodes")
  .select("id, config")
  .eq("flow_version_id", runBefore.flow_version_id)
  .eq("config->>action", "find_customer")
  .limit(1)
  .maybeSingle();

const variables = { ...runBefore.variables, customer_phone: PHONE };
const normalized = normalizeFindCustomerConfig(findNode?.config ?? {});
const scope = buildActionVariableScope(variables, null);
const resolvedLookup = resolveFieldBindingAsString(normalized.value, scope);

const trace = [];
trace.push({
  step: "pre_resume",
  runStatus: runBefore.status,
  currentNodeId: runBefore.current_node_id,
  findCustomerNodeId: findNode?.id,
  findCustomerBinding: normalized.value,
  stored: {
    customer_phone: variables.customer_phone,
    customer_phone_nested: variables.customer?.phone,
  },
  resolvedLookupValue: resolvedLookup,
});

const repository = new SupabaseCustomerRepository(sb);
let queryLog = null;
const customerService = {
  async findCustomer(input) {
    queryLog = input;
    return new DefaultCustomerServicePort(repository).findCustomer({ ...input, userId });
  },
};

const engine = new AutomationEngine({
  flows: createSupabaseAutomationFlowRepository(sb),
  runs: createSupabaseAutomationRunRepository(sb),
  sessions: createSupabaseConversationSessionRepository(sb),
  versions: createSupabaseAutomationFlowVersionRepository(sb),
  versionGraph: createSupabaseAutomationFlowVersionGraphRepository(sb),
  registry: new AutomationNodeRegistry().registerMany(createBuiltInAutomationNodeHandlers({ customerService })),
});

await sb.from("automation_runs").update({
  status: "waiting_input",
  current_node_id: "d2da8df9-7330-4b6b-93e8-592638e7e41a",
  variables: { ...variables, __waitingFor: "customer_phone", __prompt: "what is your phone number?" },
}).eq("id", RUN_ID);

const { data: runWaiting } = await sb.from("automation_runs").select("*").eq("id", RUN_ID).single();
const resumeInput = buildResumeInput(runWaiting, PHONE, { whatsappMessageType: "text" });
trace.push({ step: "buildResumeInput", resumeInput });

let resumeError = null;
let resumeResult = null;
try {
  const result = await engine.resume(ctx, { runId: RUN_ID, input: resumeInput });
  resumeResult = {
    lifecycle: result.lifecycle,
    currentNodeId: result.currentNodeId,
    customer_phone: result.variables.customer_phone,
    customer: result.variables.customer,
    lookup: result.variables.lookup,
    __waitingFor: result.variables.__waitingFor,
    __branch: result.variables.__branch,
  };
} catch (error) {
  resumeError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

trace.push({ step: "find_customer.query", queryLog });
trace.push({ step: "resume_result", resumeResult, resumeError });

const { data: runAfter } = await sb.from("automation_runs").select("*").eq("id", RUN_ID).single();
trace.push({
  step: "run_after",
  status: runAfter?.status,
  current_node_id: runAfter?.current_node_id,
  variables: {
    customer_phone: runAfter?.variables?.customer_phone,
    customer: runAfter?.variables?.customer,
    lookup: runAfter?.variables?.lookup,
    __waitingFor: runAfter?.variables?.__waitingFor,
  },
});

const out = { RUN_ID, trace, resumeError, resumeResult };
mkdirSync(resolve(root, "docs/architecture"), { recursive: true });
writeFileSync(resolve(root, "docs/architecture/phone-reply-crm-resume-trace.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
