/**
 * Enterprise Channel Platform end-to-end verification.
 * Run: npm run channel:e2e (from artifacts/login-app)
 */
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createAIObservabilityServices } from "../lib/ai-observability/src/index.ts";
import { createConversationServices } from "../lib/ai-conversation/src/index.ts";
import { AIExecutionService } from "../lib/ai-execution-engine/src/services/ai-execution-service.ts";
import { AIExecutionMetricsService } from "../lib/ai-execution-engine/src/services/ai-execution-metrics-service.ts";
import { AIExecutionPolicyService } from "../lib/ai-execution-engine/src/services/ai-execution-policy-service.ts";
import {
  createSupabaseAIExecutionMetricsRepository,
  createSupabaseAIExecutionRepository,
  createSupabasePromptBuildReader,
  createSupabaseProviderConnectionReader,
} from "../lib/ai-execution-engine/src/repositories/supabase-execution-repositories.ts";
import { createIntentEngineServices } from "../lib/ai-intent-engine/src/index.ts";
import {
  AIProviderFactory,
  createAIProviderAdapterRegistry,
  createOpenAIChatAdapter,
  createStubAdapters,
  createSupabaseAIProviderConnectionRepository,
  createSupabaseAIProviderDefinitionRepository,
} from "../lib/ai-provider-layer/src/index.ts";
import { AIProviderHealthService } from "../lib/ai-provider-layer/src/services/ai-provider-health-service.ts";
import { AIProviderRegistryService } from "../lib/ai-provider-layer/src/services/ai-provider-registry-service.ts";
import { createPromptOrchestratorServices } from "../lib/ai-prompt-orchestrator/src/index.ts";
import { createChannelRegistryServices } from "../lib/channel-registry/src/index.ts";
import { createChannelPlatformServices } from "../lib/channel-platform/src/index.ts";
import { createRetrievalServices } from "../lib/retrieval-engine/src/index.ts";
import { createRuntimeIntegrationServices } from "../lib/runtime-integration/src/index.ts";
import { createVectorQueryServices } from "../lib/vector-query/src/index.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { loadSupabaseEnv, resolveSupabaseConfig } from "./lib/supabase-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const DEMO_PASSWORD = "DemoVault2026!";
const DEMO_BETA_COMPANY_ID = "d0000010-0001-4001-8001-000000000002";
const PLATFORM_OWNER = "demo-platform@vaultos.local";
const MOCK_CHAT_RESPONSE =
  "Enterprise MFA policy requires multi-factor authentication for all users accessing sensitive systems.";

type Result = { scenario: string; pass: boolean; detail: string; evidence?: Record<string, unknown> };
const results: Result[] = [];

function record(scenario: string, pass: boolean, detail: string, evidence?: Record<string, unknown>) {
  results.push({ scenario, pass, detail, evidence });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${scenario} — ${detail}`);
}

function createMockOpenAIFetch() {
  return async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { stream?: boolean };

    if (url.includes("/embeddings")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: "text-embedding-3-small",
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] }],
          usage: { total_tokens: 16 },
        }),
      } as Response;
    }

    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: MOCK_CHAT_RESPONSE }, finish_reason: null }] })}\n\n`,
            ),
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
            ),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return { ok: true, status: 200, body: stream, json: async () => ({}) } as Response;
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: "gpt-4o-mini",
        choices: [{ message: { role: "assistant", content: MOCK_CHAT_RESPONSE }, finish_reason: "stop" }],
        usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
      }),
    } as Response;
  };
}

async function signIn(url: string, key: string) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: PLATFORM_OWNER, password: DEMO_PASSWORD });
  if (error) throw new Error(error.message);
  return { client, userId: data.user!.id };
}

function makeContext(userId: string) {
  return {
    userId,
    companyId: DEMO_BETA_COMPANY_ID,
    isSuperAdmin: true,
    hasPermission: () => true,
  };
}

async function ensureAIProviderConnection(client: SupabaseClient, ctx: ReturnType<typeof makeContext>) {
  const definitionRepo = createSupabaseAIProviderDefinitionRepository(client);
  const connectionRepo = createSupabaseAIProviderConnectionRepository(client);
  const factory = new AIProviderFactory(
    definitionRepo,
    createAIProviderAdapterRegistry({
      ...createStubAdapters(),
      openai: (configuration) =>
        createOpenAIChatAdapter({ apiKey: "e2e-mock-key", model: "gpt-4o-mini", ...configuration }, {
          fetchFn: createMockOpenAIFetch(),
        }),
    }),
  );
  const registry = new AIProviderRegistryService(definitionRepo, connectionRepo, factory);
  const connections = await registry.listConnections(ctx as never, { companyId: DEMO_BETA_COMPANY_ID });
  const existing = connections.find((item) => item.ai_provider_definition?.key === "openai" && item.is_enabled);
  if (existing) return existing.id;

  const provider = await definitionRepo.findByKey("openai");
  if (!provider) throw new Error("OpenAI provider definition missing.");

  const created = await registry.createConnection(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    providerId: provider.id,
    displayName: "E2E Channel Platform OpenAI",
    configuration: { model: "gpt-4o-mini", apiKey: "e2e-mock-key", execution_policy: { streaming: true } },
    isEnabled: true,
    isDefault: true,
  });
  return created.id;
}

async function ensureWebChatCompanyChannel(client: SupabaseClient, ctx: ReturnType<typeof makeContext>) {
  const channelRegistry = createChannelRegistryServices(client);
  const existing = await channelRegistry.companyChannels.listCompanyChannels(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    channelKey: "web_chat",
    isEnabled: true,
  });
  if (existing[0]) return existing[0].id;

  const { data: channelType } = await client
    .from("communication_channels")
    .select("id")
    .eq("key", "web_chat")
    .maybeSingle();
  if (!channelType?.id) throw new Error("web_chat communication channel missing.");

  const created = await channelRegistry.companyChannels.createConnection(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    channelId: channelType.id,
    displayName: "E2E Web Chat",
    provider: "stub",
    isEnabled: true,
    isDefault: true,
    status: "active",
    healthStatus: "connected",
  });
  return created.id;
}

async function ensureAssistant(client: SupabaseClient) {
  const { data } = await client
    .from("ai_assistant_settings")
    .select("id")
    .eq("company_id", DEMO_BETA_COMPANY_ID)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!data?.id) throw new Error("AI assistant settings missing for demo company.");
  return data.id;
}

function createExecutionServices(client: SupabaseClient, factory: AIProviderFactory) {
  const executionRepository = createSupabaseAIExecutionRepository(client);
  const metricsRepository = createSupabaseAIExecutionMetricsRepository(client);
  const promptBuildReader = createSupabasePromptBuildReader(client);
  const providerConnectionReader = createSupabaseProviderConnectionReader(client);
  const policyService = new AIExecutionPolicyService();

  return {
    execution: new AIExecutionService(
      executionRepository,
      metricsRepository,
      promptBuildReader,
      providerConnectionReader,
      factory,
      policyService,
    ),
    policy: policyService,
    metrics: new AIExecutionMetricsService(executionRepository, metricsRepository),
  };
}

async function ensureExecutionPolicy(client: SupabaseClient) {
  const { data: existing } = await client
    .from("execution_policies")
    .select("id")
    .eq("company_id", DEMO_BETA_COMPANY_ID)
    .eq("is_default", true)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await client
    .from("execution_policies")
    .insert({
      company_id: DEMO_BETA_COMPANY_ID,
      policy_name: "default",
      knowledge_retrieval_enabled: true,
      is_default: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function main() {
  const env = loadSupabaseEnv(root);
  const config = resolveSupabaseConfig(env);
  if (!config) {
    throw new Error("Supabase configuration not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }
  const { client, userId } = await signIn(config.url, config.key);
  const ctx = makeContext(userId);

  await client.rpc("_demo_set_triggers", { enabled: false });
  await ensureExecutionPolicy(client);

  const providerConnectionId = await ensureAIProviderConnection(client, ctx);
  const companyChannelId = await ensureWebChatCompanyChannel(client, ctx);
  const aiAssistantId = await ensureAssistant(client);

  const conversationServices = createConversationServices(client);
  const intentServices = createIntentEngineServices(client);
  const promptServices = createPromptOrchestratorServices(client);
  const vectorQueryServices = createVectorQueryServices(client);
  const retrievalServices = createRetrievalServices(client);
  const channelRegistryServices = createChannelRegistryServices(client);

  const definitionRepo = createSupabaseAIProviderDefinitionRepository(client);
  const connectionRepo = createSupabaseAIProviderConnectionRepository(client);
  const aiFactory = new AIProviderFactory(
    definitionRepo,
    createAIProviderAdapterRegistry({
      ...createStubAdapters(),
      openai: (configuration) =>
        createOpenAIChatAdapter({ apiKey: "e2e-mock-key", model: "gpt-4o-mini", ...configuration }, {
          fetchFn: createMockOpenAIFetch(),
        }),
    }),
  );
  const executionServices = createExecutionServices(client, aiFactory);
  const providerServices = {
    registry: new AIProviderRegistryService(definitionRepo, connectionRepo, aiFactory),
    factory: aiFactory,
    health: new AIProviderHealthService(connectionRepo, aiFactory),
  };

  const { createRuntimeEnginePortsWithContext } = await import(
    "../artifacts/login-app/src/lib/runtime-integration/engine-ports.ts"
  );
  const { createRuntimeObservabilityPort } = await import(
    "../artifacts/login-app/src/lib/runtime-integration/observability-adapter.ts"
  );
  const { createChannelPlatformPortsWithContext } = await import(
    "../artifacts/login-app/src/lib/channel-platform/platform-ports.ts"
  );

  const observabilityServices = createAIObservabilityServices(client);
  const runtimePorts = createRuntimeEnginePortsWithContext(
    {
      conversation: conversationServices,
      intent: intentServices,
      vectorQuery: vectorQueryServices,
      retrieval: retrievalServices,
      prompt: promptServices,
      execution: executionServices,
      provider: providerServices,
    },
    ctx,
  );

  const runtime = createRuntimeIntegrationServices(client, {
    ports: runtimePorts,
    telemetry: createRuntimeObservabilityPort(
      { trace: observabilityServices.trace, analytics: observabilityServices.analytics },
      ctx,
    ),
  });

  const channelPorts = createChannelPlatformPortsWithContext(
    {
      channelRegistry: channelRegistryServices,
      conversation: conversationServices,
      runtime,
    },
    { registry: ctx, conversation: ctx, runtime: ctx },
  );

  const channelPlatform = createChannelPlatformServices(client, { ports: channelPorts });

  const conversation = await conversationServices.conversations.createConversation(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    aiAssistantId,
    channelType: "web_chat",
    companyChannelId,
    metadata: { source: "channel_platform_e2e" },
  });

  const externalThreadId = conversation.id;
  const idempotencyKey = randomUUID();
  const userQuestion = "What is the enterprise MFA policy?";
  const streamChunks: string[] = [];

  const routeResponse = await channelPlatform.router.routeInbound(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    companyChannelId,
    channelKey: "web_chat",
    source: "direct",
    idempotencyKey,
    externalThreadId,
    conversationId: conversation.id,
    aiAssistantId,
    payload: { text: userQuestion, externalThreadId },
    executeAi: true,
    runtimeConfig: {
      providerConnectionId,
      executionPolicy: { streaming: true },
    },
    onStreamChunk: (chunk) => streamChunks.push(chunk),
  });

  record(
    "1. Incoming channel event routed",
    Boolean(routeResponse.inboundEventId),
    `inboundEventId=${routeResponse.inboundEventId}`,
    { routeResponse },
  );

  record(
    "2. Conversation session resolved",
    routeResponse.conversationId === conversation.id && Boolean(routeResponse.channelSessionId),
    `conversationId=${routeResponse.conversationId}, sessionId=${routeResponse.channelSessionId}`,
  );

  record(
    "3. Runtime execution triggered",
    Boolean(routeResponse.runtimeExecutionId) && Boolean(routeResponse.responseContent),
    `executionId=${routeResponse.runtimeExecutionId}`,
    { responsePreview: routeResponse.responseContent?.slice(0, 120) },
  );

  record(
    "4. Outbound channel response dispatched",
    Boolean(routeResponse.outboundDeliveryId),
    `deliveryId=${routeResponse.outboundDeliveryId}`,
  );

  const { data: inboundEvent } = await client
    .from("channel_inbound_events")
    .select("*")
    .eq("id", routeResponse.inboundEventId)
    .maybeSingle();

  record(
    "5. Inbound event processed",
    inboundEvent?.processing_status === "processed",
    `status=${inboundEvent?.processing_status}`,
    { inboundEvent },
  );

  const { data: deliveryEvent } = await client
    .from("channel_delivery_events")
    .select("*")
    .eq("id", routeResponse.outboundDeliveryId ?? "")
    .maybeSingle();

  record(
    "6. Delivery status tracked",
    deliveryEvent?.delivery_status === "sent",
    `status=${deliveryEvent?.delivery_status}, externalMessageId=${deliveryEvent?.external_message_id ?? "n/a"}`,
    { deliveryEvent },
  );

  const { data: session } = await client
    .from("channel_sessions")
    .select("*")
    .eq("id", routeResponse.channelSessionId)
    .maybeSingle();

  record(
    "7. Channel session updated",
    Boolean(session?.last_inbound_at) && Boolean(session?.last_outbound_at),
    `lastInbound=${session?.last_inbound_at}, lastOutbound=${session?.last_outbound_at}`,
  );

  const { data: messages } = await client
    .from("conversation_messages")
    .select("id, message_type, content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });

  const hasIncoming = messages?.some((message) => message.message_type === "incoming");
  const hasOutgoing = messages?.some((message) => message.message_type === "outgoing");

  record(
    "8. Conversation messages persisted via runtime",
    Boolean(hasIncoming && hasOutgoing),
    `incoming=${hasIncoming}, outgoing=${hasOutgoing}, count=${messages?.length ?? 0}`,
  );

  record(
    "9. Streaming through channel route",
    streamChunks.length > 0,
    `chunks=${streamChunks.length}`,
    { streamedPreview: streamChunks.join("").slice(0, 120) },
  );

  const passed = results.filter((item) => item.pass).length;
  const failed = results.length - passed;
  const summary = { passed, failed, total: results.length, results };

  const reportDir = resolve(root, "docs/architecture");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    resolve(reportDir, "phase-6-channel-platform-e2e-report.json"),
    JSON.stringify(summary, null, 2),
  );
  writeFileSync(
    resolve(reportDir, "phase-6-channel-platform-e2e-report.md"),
    [
      "# Phase 6 — Enterprise Channel Platform E2E Verification Report",
      "",
      `**Generated:** ${new Date().toISOString()}`,
      `**Target:** ${config.url}`,
      `**Migration:** 108_channel_platform.sql applied`,
      "",
      "## Executive Summary",
      "",
      failed === 0
        ? "Channel Platform verification passed against live Supabase. Inbound routing, session resolution, runtime execution, outbound dispatch, and delivery tracking all completed successfully."
        : "Channel Platform verification completed with failures — see scenario details below.",
      "",
      "## Test Results",
      "",
      `- **Passed:** ${passed}`,
      `- **Failed:** ${failed}`,
      `- **Total:** ${results.length}`,
      "",
      ...results.flatMap((result) => [
        `### ${result.scenario}`,
        "",
        `- **Status:** ${result.pass ? "PASS" : "FAIL"}`,
        `- **Detail:** ${result.detail}`,
        "",
      ]),
    ].join("\n"),
  );

  console.log(`\nChannel Platform E2E: ${passed}/${results.length} passed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
