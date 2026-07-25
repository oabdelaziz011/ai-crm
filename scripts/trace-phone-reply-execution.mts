/**
 * Trace phone reply execution after Ask Question — runtime investigation only.
 * Run: pnpm --dir artifacts/login-app exec tsx ../../scripts/trace-phone-reply-execution.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createConversationServices } from "../lib/ai-conversation/src/index.ts";
import { createChannelRegistryServices } from "../lib/channel-registry/src/index.ts";
import { createChannelPlatformServices } from "../lib/channel-platform/src/index.ts";
import { createAutomationPlatformServices } from "../lib/automation-platform/src/index.ts";
import { createBuiltInAutomationNodeHandlers } from "../lib/automation-platform/src/engine/built-in-nodes.ts";
import { AutomationNodeRegistry } from "../lib/automation-platform/src/engine/node-registry.ts";
import { AutomationEngine } from "../lib/automation-platform/src/engine/automation-engine.ts";
import {
  createSupabaseAutomationEdgeRepository,
  createSupabaseAutomationFlowRepository,
  createSupabaseAutomationNodeRepository,
  createSupabaseAutomationRunRepository,
  createSupabaseConversationMessageRepository,
  createSupabaseConversationSessionRepository,
} from "../lib/automation-platform/src/repositories/supabase-automation-repositories.ts";
import { createSupabaseAutomationFlowVersionRepository } from "../lib/automation-platform/src/lifecycle/supabase-version-repository.ts";
import { createSupabaseAutomationFlowVersionGraphRepository } from "../lib/automation-platform/src/lifecycle/supabase-version-graph-repository.ts";
import { buildResumeInput } from "../lib/automation-platform/src/orchestrator/session-policy.ts";
import { buildActionVariableScope, resolveFieldBindingAsString } from "../lib/automation-platform/src/field-binding/resolver.ts";
import { normalizeFindCustomerConfig } from "../lib/automation-platform/src/crm/find-customer-config.ts";
import { DefaultCustomerServicePort } from "../lib/automation-platform/src/ports/customer-service-port.ts";
import { SupabaseCustomerRepository } from "../artifacts/login-app/src/lib/crm/supabase-customer-repository.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { loadSupabaseEnv, resolveSupabaseConfig } from "./lib/supabase-env.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const ASK_NODE = "04f805f8-085a-4d1e-bcc7-8f9228ee1ff8";
const FIND_NODE = "0bf11653-f706-4806-84ff-85ffb30557fa";
const DEMO_PASSWORD = "DemoVault2026!";
const PLATFORM_OWNER = "demo-platform@vaultos.local";
const PHONE = "+201234567890";

type TraceEvent = { step: string; detail: string; data?: Record<string, unknown> };
const trace: TraceEvent[] = [];

function log(step: string, detail: string, data?: Record<string, unknown>) {
  trace.push({ step, detail, data });
  console.log(`[${step}] ${detail}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

async function signIn(url: string, key: string) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: PLATFORM_OWNER, password: DEMO_PASSWORD });
  if (error) throw new Error(error.message);
  return { client, userId: data.user!.id };
}

function makeContext(userId: string, companyId: string) {
  return { userId, companyId, isSuperAdmin: true, hasPermission: () => true };
}

function buttonReplyPayload(messageId: string, phoneNumberId: string, waUser: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { phone_number_id: phoneNumberId },
          contacts: [{ profile: { name: "Phone Trace" }, wa_id: waUser }],
          messages: [{
            from: waUser,
            id: messageId,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "interactive",
            interactive: { type: "button_reply", button_reply: { id: "book", title: "Book Appointment" } },
          }],
        },
      }],
    }],
  };
}

function textPayload(messageId: string, phoneNumberId: string, waUser: string, text: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { phone_number_id: phoneNumberId },
          contacts: [{ profile: { name: "Phone Trace" }, wa_id: waUser }],
          messages: [{
            from: waUser,
            id: messageId,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            text: { body: text },
          }],
        },
      }],
    }],
  };
}

function createProductionEngine(client: ReturnType<typeof createClient>) {
  return new AutomationEngine({
    flows: createSupabaseAutomationFlowRepository(client),
    runs: createSupabaseAutomationRunRepository(client),
    sessions: createSupabaseConversationSessionRepository(client),
    versions: createSupabaseAutomationFlowVersionRepository(client),
    versionGraph: createSupabaseAutomationFlowVersionGraphRepository(client),
    registry: new AutomationNodeRegistry().registerMany(createBuiltInAutomationNodeHandlers()),
  });
}

function createEngineWithCustomerService(client: ReturnType<typeof createClient>, userId: string) {
  const repository = new SupabaseCustomerRepository(client);
  const customerService = new DefaultCustomerServicePort(repository);
  const wrapped = {
    async findCustomer(input: Parameters<DefaultCustomerServicePort["findCustomer"]>[0]) {
      log("find_customer.query", "Supabase findCustomersByField invoked", {
        lookupBy: input.lookupBy,
        lookupValue: input.lookupValue,
        companyId: input.companyId,
        userId: input.userId,
      });
      const result = await customerService.findCustomer({ ...input, userId: input.userId || userId });
      log("find_customer.result", "Query returned", result as unknown as Record<string, unknown>);
      return result;
    },
  };
  return new AutomationEngine({
    flows: createSupabaseAutomationFlowRepository(client),
    runs: createSupabaseAutomationRunRepository(client),
    sessions: createSupabaseConversationSessionRepository(client),
    versions: createSupabaseAutomationFlowVersionRepository(client),
    versionGraph: createSupabaseAutomationFlowVersionGraphRepository(client),
    registry: new AutomationNodeRegistry().registerMany(createBuiltInAutomationNodeHandlers({ customerService: wrapped })),
  });
}

async function resolveTarget(client: ReturnType<typeof createClient>) {
  const { data: flow } = await client.from("automation_flows").select("*").eq("id", FLOW_ID).single();
  const { data: binding } = await client
    .from("company_channel_automation_bindings")
    .select("company_channel_id")
    .eq("automation_flow_id", FLOW_ID)
    .eq("is_enabled", true)
    .limit(1)
    .maybeSingle();
  const { data: channel } = await client.from("company_channels").select("*").eq("id", binding!.company_channel_id).single();
  return {
    companyId: flow!.company_id as string,
    companyChannelId: channel!.id as string,
    phoneNumberId: String(channel!.configuration?.phoneNumberId),
    activeVersionId: flow!.active_version_id as string,
  };
}

async function routeWebhook(
  client: ReturnType<typeof createClient>,
  ctx: ReturnType<typeof makeContext>,
  target: Awaited<ReturnType<typeof resolveTarget>>,
  waUser: string,
  rawPayload: unknown,
  engineOverride?: AutomationEngine,
) {
  const conversationServices = createConversationServices(client);
  const channelRegistryServices = createChannelRegistryServices(client);
  const automationServices = createAutomationPlatformServices(client);
  if (engineOverride) {
    (automationServices as { engine: AutomationEngine }).engine = engineOverride;
  }

  const { createChannelPlatformPortsWithContext } = await import("../artifacts/login-app/src/lib/channel-platform/platform-ports.ts");
  const { createChannelAutomationPortFromClient, createChannelWorkflowFlowValidator } = await import("../artifacts/api-server/src/platform/channel-automation-port.ts");
  const { ChannelWorkflowResolver } = await import("../lib/channel-platform/src/services/channel-workflow-resolver.ts");
  const { createSupabaseChannelWorkflowBindingRepository } = await import("../lib/channel-platform/src/repositories/supabase-channel-workflow-binding-repository.ts");

  const channelPorts = createChannelPlatformPortsWithContext(
    { channelRegistry: channelRegistryServices, conversation: conversationServices },
    { registry: ctx, conversation: ctx },
  );
  channelPorts.automation = createChannelAutomationPortFromClient(automationServices.engine, ctx as never, client);

  const channelPlatform = createChannelPlatformServices(client, {
    ports: channelPorts,
    whatsAppFetchFn: async () => ({ ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.out" }] }) }) as Response,
    workflowResolver: new ChannelWorkflowResolver({
      bindings: createSupabaseChannelWorkflowBindingRepository(client),
      flowValidator: createChannelWorkflowFlowValidator(client),
    }),
  });

  const { data: assistantRow } = await client.from("ai_assistant_settings").select("id").eq("company_id", target.companyId).limit(1).maybeSingle();

  return channelPlatform.router.routeWebhook(ctx as never, {
    companyId: target.companyId,
    companyChannelId: target.companyChannelId,
    channelKey: "whatsapp",
    rawPayload,
    executeAi: false,
    aiAssistantId: assistantRow!.id,
  });
}

async function analyzeVariableBinding(client: ReturnType<typeof createClient>, variables: Record<string, unknown>, companyId: string) {
  const { data: findNode } = await client
    .from("automation_flow_version_nodes")
    .select("config")
    .eq("id", FIND_NODE)
    .maybeSingle();
  const config = findNode?.config as Record<string, unknown>;
  const normalized = normalizeFindCustomerConfig(config ?? {});
  const scope = buildActionVariableScope(variables, null);
  const resolved = resolveFieldBindingAsString(normalized.value, scope);

  log("variable.binding", "Find Customer input binding resolution", {
    binding: normalized.value,
    storedKeys: {
      customer_phone: variables.customer_phone,
      phone: variables.phone,
      "conversation.phone": (variables.conversation as Record<string, unknown> | undefined)?.phone,
      "customer.phone": (variables.customer as Record<string, unknown> | undefined)?.phone,
    },
    resolvedLookupValue: resolved,
    scopeCustomer: scope.customer,
  });
  return { normalized, resolved, scope };
}

async function main() {
  const env = loadSupabaseEnv(root);
  const config = resolveSupabaseConfig(env);
  if (!config) throw new Error("Supabase config missing");

  const { client, userId } = await signIn(config.url, config.key);
  await client.rpc("_demo_set_triggers", { enabled: false });
  const target = await resolveTarget(client);
  const ctx = makeContext(userId, target.companyId);
  const waUser = `1555${String(Date.now()).slice(-7)}`;

  log("setup", "Target resolved", { ...target, waUser, phoneReply: PHONE });

  // Phase 1: book button → ask question (production engine, no customerService)
  const prodEngine = createProductionEngine(client);
  const bookRoute = await routeWebhook(client, ctx, target, waUser, textPayload(`wamid.hi-${randomUUID()}`, target.phoneNumberId, waUser, "hi"), prodEngine);
  const bookReply = await routeWebhook(client, ctx, target, waUser, buttonReplyPayload(`wamid.book-${randomUUID()}`, target.phoneNumberId, waUser), prodEngine);

  const bookResult = bookReply.kind === "inbound" ? bookReply.result : null;
  const runId = bookResult?.automationRunId;
  if (!runId) throw new Error("No run after book reply");

  const { data: runAfterBook } = await client.from("automation_runs").select("*").eq("id", runId).single();
  log("after_book", "Run state after Book Appointment", {
    runId,
    status: runAfterBook?.status,
    current_node_id: runAfterBook?.current_node_id,
    __waitingFor: runAfterBook?.variables?.__waitingFor,
    __prompt: runAfterBook?.variables?.__prompt,
  });

  await analyzeVariableBinding(client, runAfterBook?.variables ?? {}, target.companyId);

  // Phase 2: phone reply with PRODUCTION engine (matches webhook platform)
  let productionError: string | null = null;
  try {
    const phoneRoute = await routeWebhook(
      client,
      ctx,
      target,
      waUser,
      textPayload(`wamid.phone-${randomUUID()}`, target.phoneNumberId, waUser, PHONE),
      prodEngine,
    );
    const phoneResult = phoneRoute.kind === "inbound" ? phoneRoute.result : null;
    log("production.phone_reply", "Production engine phone reply completed", phoneResult as unknown as Record<string, unknown>);
  } catch (error) {
    productionError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    log("production.phone_reply.error", productionError);
  }

  const { data: runAfterProdPhone } = await client.from("automation_runs").select("*").eq("id", runId).single();
  log("after_production_phone", "Run state after production phone reply attempt", {
    status: runAfterProdPhone?.status,
    current_node_id: runAfterProdPhone?.current_node_id,
    error_message: runAfterProdPhone?.error_message,
    customer_phone: runAfterProdPhone?.variables?.customer_phone,
    phone: runAfterProdPhone?.variables?.phone,
    customer: runAfterProdPhone?.variables?.customer,
    lookup: runAfterProdPhone?.variables?.lookup,
    __waitingFor: runAfterProdPhone?.variables?.__waitingFor,
  });

  // Phase 3: Direct resume analysis — what buildResumeInput produces
  const resumeInput = buildResumeInput(runAfterBook!, PHONE, { whatsappMessageType: "text" });
  log("buildResumeInput", "Resume input for phone text", resumeInput as Record<string, unknown>);

  // Phase 4: Engine WITH customerService on fresh run reaching ask node
  const engineWithCrm = createEngineWithCustomerService(client, userId);
  const waUser2 = `1555${String(Date.now()).slice(-6)}9`;
  await routeWebhook(client, ctx, target, waUser2, textPayload(`wamid.hi2-${randomUUID()}`, target.phoneNumberId, waUser2, "hi"), engineWithCrm);
  await routeWebhook(client, ctx, target, waUser2, buttonReplyPayload(`wamid.book2-${randomUUID()}`, target.phoneNumberId, waUser2), engineWithCrm);

  const { data: session2 } = await client
    .from("conversation_sessions")
    .select("run_id")
    .eq("external_user_id", waUser2)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: run2 } = await client.from("automation_runs").select("*").eq("id", session2!.run_id!).single();
  let crmError: string | null = null;
  try {
    const resumeInput2 = buildResumeInput(run2!, PHONE, { whatsappMessageType: "text" });
    log("crm.resume_input", "Resume input before CRM engine resume", resumeInput2 as Record<string, unknown>);
    const result = await engineWithCrm.resume(ctx as never, { runId: run2!.id, input: resumeInput2 });
    log("crm.resume_result", "CRM-enabled engine resume completed", {
      lifecycle: result.lifecycle,
      currentNodeId: result.currentNodeId,
      customer_phone: result.variables.customer_phone,
      customer: result.variables.customer,
      lookup: result.variables.lookup,
      __waitingFor: result.variables.__waitingFor,
    });
  } catch (error) {
    crmError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    log("crm.resume.error", crmError);
  }

  const report = {
    tracedAt: new Date().toISOString(),
    askNode: ASK_NODE,
    findCustomerNode: FIND_NODE,
    phoneReply: PHONE,
    productionError,
    crmError,
    runAfterProductionPhone: runAfterProdPhone,
    trace,
    rootCauseCandidates: [
      productionError ? { id: "missing_customer_service", error: productionError } : null,
      crmError ? { id: "crm_engine_error", error: crmError } : null,
    ].filter(Boolean),
  };

  const outDir = resolve(root, "docs/architecture");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "phone-reply-execution-trace.json"), JSON.stringify(report, null, 2));
  console.log("\nWrote docs/architecture/phone-reply-execution-trace.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
