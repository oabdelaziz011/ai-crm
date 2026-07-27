/**
 * AI Chat end-to-end acceptance (Tests 1–4).
 * Run: node --import tsx/esm scripts/ai-chat-e2e-acceptance.mts
 */
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createChannelPlatformServices } from "../lib/channel-platform/src/index.ts";
import { createChannelRegistryServices } from "../lib/channel-registry/src/index.ts";
import { createConversationServices } from "../lib/ai-conversation/src/index.ts";
import { createRuntimeIntegrationServices } from "../lib/runtime-integration/src/index.ts";
import { createIntentEngineServices } from "../lib/ai-intent-engine/src/index.ts";
import { createVectorQueryServices } from "../lib/vector-query/src/index.ts";
import { createRetrievalServices } from "../lib/retrieval-engine/src/index.ts";
import { createPromptOrchestratorServices } from "../lib/ai-prompt-orchestrator/src/index.ts";
import { createAIExecutionServices } from "../lib/ai-execution-engine/src/index.ts";
import { createAIProviderServices } from "../lib/ai-provider-layer/src/index.ts";
import { createAIObservabilityServices } from "../lib/ai-observability/src/index.ts";
import { createToolRouterServices } from "../lib/ai-tool-router/src/index.ts";
import { createPlatformAIProviderServices } from "../lib/platform-ai-provider/src/index.ts";
import { createPlatformRuntimeConfigPort } from "../artifacts/login-app/src/lib/platform-ai-provider/platform-runtime-port.ts";
import { createSupabaseCustomerServicePort } from "../lib/automation-platform/src/crm/supabase/create-supabase-customer-service-port.ts";
import { createEnterpriseRuntimeIntegrations } from "../artifacts/login-app/src/lib/runtime-integration/runtime-adapters.ts";
import { createRuntimeToolPort } from "../artifacts/login-app/src/lib/runtime-integration/tool-port-adapter.ts";
import { createRuntimeEnginePortsWithContext } from "../artifacts/login-app/src/lib/runtime-integration/engine-ports.ts";
import { createRuntimeObservabilityPort } from "../artifacts/login-app/src/lib/runtime-integration/observability-adapter.ts";
import { createChannelPlatformPortsWithContext } from "../artifacts/login-app/src/lib/channel-platform/platform-ports.ts";
import { resolvePermissionCode } from "../artifacts/login-app/src/lib/rbac/permission-aliases.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSupabaseEnv, resolveSupabaseConfig } from "./lib/supabase-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const evidenceDir = resolve(root, "docs/operations/evidence/ai-chat-e2e");
mkdirSync(evidenceDir, { recursive: true });

const DEMO_PASSWORD = "DemoVault2026!";
const COMPANY_BETA = "d0000010-0001-4001-8001-000000000002";
const COMPANY_ALPHA = "d0000010-0001-4001-8001-000000000001";
const BETA_ADMIN = "demo-beta-admin@vaultos.local";
const ALPHA_ADMIN = "demo-alpha-admin@vaultos.local";

type Evidence = {
  test: string;
  pass: boolean;
  detail: string;
  data?: Record<string, unknown>;
};

const evidence: Evidence[] = [];
const runtimeLogs: string[] = [];
const toolLogs: string[] = [];

function record(test: string, pass: boolean, detail: string, data?: Record<string, unknown>) {
  evidence.push({ test, pass, detail, data });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${test} — ${detail}`);
}

function captureLogs() {
  const original = console.info;
  console.info = (...args: unknown[]) => {
    const line = args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ");
    if (line.includes("ai_runtime_") || line.includes('"event"')) runtimeLogs.push(line);
    original(...args);
  };
}

async function signIn(url: string, key: string, email: string) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return { client, userId: data.user!.id, session: data.session! };
}

async function loadPermissionCodes(client: SupabaseClient, userId: string) {
  const permissionIds = new Set<string>();

  const { data: userPerms } = await client.from("user_permissions").select("permission_id").eq("user_id", userId);
  for (const row of userPerms ?? []) {
    if (row.permission_id) permissionIds.add(row.permission_id);
  }

  const { data: userRoles } = await client.from("user_roles").select("role_id").eq("user_id", userId);
  const roleIds = (userRoles ?? []).map((row) => row.role_id).filter(Boolean);
  if (roleIds.length > 0) {
    const { data: rolePerms } = await client.from("role_permissions").select("permission_id").in("role_id", roleIds);
    for (const row of rolePerms ?? []) {
      if (row.permission_id) permissionIds.add(row.permission_id);
    }
  }

  const uniqueIds = [...permissionIds];
  if (uniqueIds.length === 0) {
    const { data: catalog } = await client.from("permissions").select("code");
    const codes: string[] = [];
    for (const row of catalog ?? []) {
      const { data: allowed } = await client.rpc("user_has_permission", { p_code: row.code });
      if (allowed) codes.push(row.code as string);
    }
    return codes;
  }

  const { data: permissions } = await client.from("permissions").select("code").in("id", uniqueIds);
  return (permissions ?? []).map((row) => row.code as string);
}

function buildContext(userId: string, companyId: string, permissionCodes: string[], isSuperAdmin = false) {
  const hasPermission = (code: string) => {
    if (isSuperAdmin) return true;
    const resolved = resolvePermissionCode(code);
    return permissionCodes.some((item) => item === code || item === resolved);
  };
  return { userId, companyId, isSuperAdmin, hasPermission };
}

function bootstrapChannelPlatform(client: SupabaseClient, ctx: ReturnType<typeof buildContext>) {
  const channelRegistryServices = createChannelRegistryServices(client);
  const conversationServices = createConversationServices(client);
  const observabilityServices = createAIObservabilityServices(client);
  const intentServices = createIntentEngineServices(client);
  const vectorQueryServices = createVectorQueryServices(client);
  const retrievalServices = createRetrievalServices(client);
  const promptServices = createPromptOrchestratorServices(client);
  const providerServices = createAIProviderServices(client);
  const platformServices = createPlatformAIProviderServices(client);
  const toolRouterServices = createToolRouterServices(client, {
    customerService: createSupabaseCustomerServicePort(client, () => ctx.userId),
  });
  const tools = createRuntimeToolPort(toolRouterServices);
  const executionServices = createAIExecutionServices(
    client,
    createEnterpriseRuntimeIntegrations({
      promptRuntime: promptServices.runtime,
      gateway: providerServices.gateway,
      knowledge: retrievalServices.knowledge,
      tools,
      platformConfig: createPlatformRuntimeConfigPort(async ({ companyId, providerKey, useCase }) => {
        const runtime = await platformServices.platform.resolveRuntimeConfig(companyId, providerKey, useCase);
        return {
          apiKey: runtime.apiKey,
          model: runtime.model,
          baseUrl: runtime.baseUrl,
          providerKey: runtime.providerKey,
        };
      }),
    }),
  );

  const registryCtx = ctx;
  const conversationCtx = ctx;
  const runtimeCtx = ctx;
  const ports = createRuntimeEnginePortsWithContext(
    {
      conversation: conversationServices,
      intent: intentServices,
      vectorQuery: vectorQueryServices,
      retrieval: retrievalServices,
      prompt: promptServices,
      execution: executionServices,
      provider: providerServices,
    },
    runtimeCtx,
  );
  const runtimeServices = createRuntimeIntegrationServices(client, {
    ports,
    telemetry: createRuntimeObservabilityPort(
      { trace: observabilityServices.trace, analytics: observabilityServices.analytics },
      runtimeCtx,
    ),
  });
  const channelPorts = createChannelPlatformPortsWithContext(
    { channelRegistry: channelRegistryServices, conversation: conversationServices, runtime: runtimeServices },
    { registry: registryCtx, conversation: conversationCtx, runtime: runtimeCtx },
  );
  const channelPlatform = createChannelPlatformServices(client, { ports: channelPorts });
  return {
    channelPlatform,
    conversationServices,
    conversationCtx,
    channelCtx: ctx,
    providerServices,
    providerCtx: ctx,
  };
}

async function resolveWebChatChannel(client: SupabaseClient, companyId: string) {
  const { data, error } = await client
    .from("company_channels")
    .select("id, company_id, is_enabled, communication_channel:communication_channels(key)")
    .eq("company_id", companyId)
    .eq("is_enabled", true);
  if (error) throw error;
  const channel = (data ?? []).find(
    (row) => (row.communication_channel as { key?: string } | null)?.key === "web_chat",
  );
  return channel ?? null;
}

async function resolveProviderConnection(client: SupabaseClient, companyId: string) {
  const { data, error } = await client
    .from("ai_provider_connections")
    .select("id, is_default, is_enabled, configuration, ai_provider_definition:ai_provider_definitions(key)")
    .eq("company_id", companyId)
    .eq("is_enabled", true)
    .is("deleted_at", null)
    .order("is_default", { ascending: false });
  if (error) throw error;
  return (data ?? []).find((row) => row.is_default) ?? data?.[0] ?? null;
}

async function resolveAssistant(client: SupabaseClient, companyId: string) {
  const { data, error } = await client
    .from("ai_assistant_settings")
    .select("id")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function sendChatMessage(
  stack: ReturnType<typeof bootstrapChannelPlatform>,
  input: {
    companyId: string;
    conversationId: string;
    webChatChannelId: string;
    assistantId: string;
    providerConnectionId: string;
    text: string;
  },
) {
  return stack.channelPlatform.router.routeInbound(stack.channelCtx, {
    companyId: input.companyId,
    companyChannelId: input.webChatChannelId,
    channelKey: "web_chat",
    source: "direct",
    externalThreadId: input.conversationId,
    conversationId: input.conversationId,
    aiAssistantId: input.assistantId,
    payload: { text: input.text, externalThreadId: input.conversationId },
    executeAi: true,
    runtimeConfig: {
      providerConnectionId: input.providerConnectionId,
      executionPolicy: { streaming: false },
    },
  });
}

function looksLikeJsonContract(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return "status" in parsed || "reply" in parsed || "requires_human" in parsed;
  } catch {
    return false;
  }
}

async function main() {
  captureLogs();
  const env = loadSupabaseEnv(root);
  const config = resolveSupabaseConfig(env);
  if (!config) throw new Error("Missing Supabase env (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)");

  const beta = await signIn(config.url, config.key, BETA_ADMIN);
  const betaPermissions = await loadPermissionCodes(beta.client, beta.userId);
  const betaCtx = buildContext(beta.userId, COMPANY_BETA, betaPermissions);
  const stack = bootstrapChannelPlatform(beta.client, betaCtx);

  const webChat = await resolveWebChatChannel(beta.client, COMPANY_BETA);
  const providerConnection = await resolveProviderConnection(beta.client, COMPANY_BETA);
  const assistantId = await resolveAssistant(beta.client, COMPANY_BETA);

  if (!webChat?.id || !providerConnection?.id || !assistantId) {
    throw new Error(
      `Missing prerequisites: webChat=${webChat?.id ?? "none"}, provider=${providerConnection?.id ?? "none"}, assistant=${assistantId ?? "none"}`,
    );
  }

  const conversation = await stack.conversationServices.conversations.createConversation(stack.conversationCtx, {
    companyId: COMPANY_BETA,
    aiAssistantId: assistantId,
    channelType: "web_chat",
    companyChannelId: webChat.id,
    metadata: { source: "ai_chat_e2e_acceptance" },
  });

  // Test 1 — Conversation
  runtimeLogs.length = 0;
  const helloResult = await sendChatMessage(stack, {
    companyId: COMPANY_BETA,
    conversationId: conversation.id,
    webChatChannelId: webChat.id,
    assistantId,
    providerConnectionId: providerConnection.id,
    text: "Hello",
  });

  const helloResponse = helloResult.responseContent ?? "";
  const helloOpenAiLog = runtimeLogs.find((line) => line.includes("ai_runtime_openai_request"));
  const helloLogPayload = helloOpenAiLog ? JSON.parse(helloOpenAiLog) : null;
  const helloPass =
    helloResponse.trim().length > 0 &&
    !looksLikeJsonContract(helloResponse) &&
    !helloResponse.toLowerCase().includes("structured response contract") &&
    helloLogPayload?.responseFormat === "text";

  record("Test 1 — Conversation (Hello)", helloPass, helloResponse.slice(0, 240), {
    response: helloResponse,
    openAiRequest: helloLogPayload,
    runtimeLogs: runtimeLogs.slice(-5),
  });

  // Test 2 — Tool calling
  runtimeLogs.length = 0;
  toolLogs.length = 0;
  const uniquePhone = `010${String(Date.now()).slice(-8)}`;
  const createPrompt = `Create a customer named Ahmed Mohamed with phone ${uniquePhone}.`;
  const createResult = await sendChatMessage(stack, {
    companyId: COMPANY_BETA,
    conversationId: conversation.id,
    webChatChannelId: webChat.id,
    assistantId,
    providerConnectionId: providerConnection.id,
    text: createPrompt,
  });

  const createResponse = createResult.responseContent ?? "";
  const { data: toolExecutions, error: toolError } = await beta.client
    .from("tool_executions")
    .select("id, tool_key, status, input, output, error_message, started_at, completed_at")
    .eq("conversation_id", conversation.id)
    .eq("tool_key", "create_customer")
    .order("started_at", { ascending: false })
    .limit(3);

  if (toolError) throw toolError;

  const latestTool = toolExecutions?.[0] ?? null;
  if (latestTool) toolLogs.push(JSON.stringify(latestTool));

  const { data: createdCustomer, error: customerError } = await beta.client
    .from("customers")
    .select("id, name, phone, email, user_id, created_at")
    .eq("user_id", beta.userId)
    .eq("phone", uniquePhone)
    .maybeSingle();
  if (customerError) throw customerError;

  const test2Pass =
    Boolean(latestTool?.tool_key === "create_customer") &&
    latestTool?.status === "succeeded" &&
    Boolean(createdCustomer?.name?.includes("Ahmed")) &&
    createResponse.trim().length > 0;

  record("Test 2 — Tool Calling (create_customer)", test2Pass, createResponse.slice(0, 240), {
    response: createResponse,
    toolExecution: latestTool,
    customer: createdCustomer,
    runtimeLogs: runtimeLogs.slice(-8),
  });

  // Test 3 — Database verification
  const test3Pass = Boolean(createdCustomer?.id && createdCustomer.phone === uniquePhone);
  record("Test 3 — Database verification", test3Pass, createdCustomer ? `customer_id=${createdCustomer.id}` : "customer not found", {
    customer: createdCustomer,
  });

  // Test 4 — Security (Company B cannot access Company A customer)
  const alpha = await signIn(config.url, config.key, ALPHA_ADMIN);
  const alphaPermissions = await loadPermissionCodes(alpha.client, alpha.userId);
  const alphaCtx = buildContext(alpha.userId, COMPANY_ALPHA, alphaPermissions);
  void alphaCtx;

  const { data: alphaView, error: alphaViewError } = await alpha.client
    .from("customers")
    .select("id, name, phone")
    .eq("id", createdCustomer?.id ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();
  if (alphaViewError) throw alphaViewError;

  const { data: alphaEnumerate, error: alphaEnumError } = await alpha.client
    .from("customers")
    .select("id, name, phone")
    .eq("phone", uniquePhone);
  if (alphaEnumError) throw alphaEnumError;

  const test4Pass = !alphaView && (alphaEnumerate?.length ?? 0) === 0;
  record(
    "Test 4 — Security (Company B isolation)",
    test4Pass,
    test4Pass
      ? "Company A customer is not visible to Company B"
      : `Leak detected: alphaView=${JSON.stringify(alphaView)} enumerate=${JSON.stringify(alphaEnumerate)}`,
    { alphaView, alphaEnumerate },
  );

  const report = {
    executedAt: new Date().toISOString(),
    companyA: { id: COMPANY_BETA, admin: BETA_ADMIN },
    companyB: { id: COMPANY_ALPHA, admin: ALPHA_ADMIN },
    conversationId: conversation.id,
    evidence,
    runtimeLogs,
    toolLogs,
    productionReadiness: {
      allPassed: evidence.every((item) => item.pass),
      blockers: evidence.filter((item) => !item.pass).map((item) => item.test),
    },
  };

  writeFileSync(resolve(evidenceDir, "acceptance-report.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    resolve(evidenceDir, "acceptance-summary.md"),
    [
      "# AI Chat E2E Acceptance",
      "",
      `Executed: ${report.executedAt}`,
      "",
      ...evidence.map((item) => `- [${item.pass ? "x" : " "}] **${item.test}** — ${item.detail}`),
      "",
      "## Production readiness",
      report.productionReadiness.allPassed
        ? "**READY** — all acceptance tests passed against live Supabase + OpenAI."
        : `**NOT READY** — failing: ${report.productionReadiness.blockers.join(", ")}`,
    ].join("\n"),
  );

  console.log("\nEvidence written to docs/operations/evidence/ai-chat-e2e/");
  if (!report.productionReadiness.allPassed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
