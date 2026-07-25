/**
 * WhatsApp Cloud Adapter end-to-end verification.
 * Run: npm run whatsapp:e2e (from artifacts/login-app)
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
import {
  createChannelPlatformServices,
  verifyWhatsAppWebhookChallenge,
} from "../lib/channel-platform/src/index.ts";
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
const VERIFY_TOKEN = "vault-wa-verify-token-e2e-demo-beta";
const PHONE_NUMBER_ID = "100000000000001";
const WA_USER = "15551234567";
const MOCK_CHAT_RESPONSE = "Thanks for your WhatsApp message. Enterprise MFA policy requires multi-factor authentication.";

type Result = { scenario: string; pass: boolean; detail: string; evidence?: Record<string, unknown> };
const results: Result[] = [];
const graphRequests: Array<{ url: string; body: unknown }> = [];

function record(scenario: string, pass: boolean, detail: string, evidence?: Record<string, unknown>) {
  results.push({ scenario, pass, detail, evidence });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${scenario} — ${detail}`);
}

function createMockWhatsAppFetch() {
  return async (url: string, init?: RequestInit) => {
    graphRequests.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });

    if (String(url).includes("/messages")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          messaging_product: "whatsapp",
          contacts: [{ input: WA_USER, wa_id: WA_USER }],
          messages: [{ id: "wamid.outbound-e2e-1" }],
        }),
      } as Response;
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ url: "https://lookaside.fbsbx.com/media/mock" }),
    } as Response;
  };
}

function createMockOpenAIFetch() {
  return async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { stream?: boolean };
    if (url.includes("/embeddings")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] }],
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
        choices: [{ message: { role: "assistant", content: MOCK_CHAT_RESPONSE }, finish_reason: "stop" }],
        usage: { prompt_tokens: 80, completion_tokens: 30, total_tokens: 110 },
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
    displayName: "E2E WhatsApp OpenAI",
    configuration: { model: "gpt-4o-mini", apiKey: "e2e-mock-key", execution_policy: { streaming: false } },
    isEnabled: true,
    isDefault: true,
  });
  return created.id;
}

async function ensureWhatsAppCompanyChannel(client: SupabaseClient, ctx: ReturnType<typeof makeContext>) {
  const channelRegistry = createChannelRegistryServices(client);
  const existing = await channelRegistry.companyChannels.listCompanyChannels(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    channelKey: "whatsapp",
    isEnabled: true,
  });
  if (existing[0]) {
    await channelRegistry.companyChannels.updateConfiguration(ctx as never, {
      companyChannelId: existing[0].id,
      configuration: {
        phoneNumberId: PHONE_NUMBER_ID,
        accessToken: "e2e-wa-token",
        verifyToken: VERIFY_TOKEN,
        apiVersion: "v21.0",
      },
      provider: "meta",
    });
    return existing[0].id;
  }

  const { data: channelType } = await client
    .from("communication_channels")
    .select("id")
    .eq("key", "whatsapp")
    .maybeSingle();
  if (!channelType?.id) throw new Error("whatsapp communication channel missing.");

  const created = await channelRegistry.companyChannels.createConnection(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    channelId: channelType.id,
    displayName: "E2E WhatsApp",
    provider: "meta",
    configuration: {
      phoneNumberId: PHONE_NUMBER_ID,
      accessToken: "e2e-wa-token",
      verifyToken: VERIFY_TOKEN,
      apiVersion: "v21.0",
    },
    isEnabled: true,
    isDefault: false,
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

function inboundPayload(messageId: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              contacts: [{ profile: { name: "E2E User" }, wa_id: WA_USER }],
              messages: [
                {
                  from: WA_USER,
                  id: messageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "What is the enterprise MFA policy?" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function statusPayload(messageId: string, status: "delivered" | "read") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              statuses: [
                {
                  id: messageId,
                  status,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: WA_USER,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function main() {
  const startedAt = performance.now();
  const env = loadSupabaseEnv(root);
  const config = resolveSupabaseConfig(env);
  if (!config) throw new Error("Supabase configuration not found.");

  const { client, userId } = await signIn(config.url, config.key);
  const ctx = makeContext(userId);
  await client.rpc("_demo_set_triggers", { enabled: false });
  await ensureExecutionPolicy(client);

  const providerConnectionId = await ensureAIProviderConnection(client, ctx);
  const companyChannelId = await ensureWhatsAppCompanyChannel(client, ctx);
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
    { channelRegistry: channelRegistryServices, conversation: conversationServices, runtime },
    { registry: ctx, conversation: ctx, runtime: ctx },
  );
  const channelPlatform = createChannelPlatformServices(client, {
    ports: channelPorts,
    whatsAppFetchFn: createMockWhatsAppFetch(),
  });

  const challenge = verifyWhatsAppWebhookChallenge({
    mode: "subscribe",
    verifyToken: VERIFY_TOKEN,
    challenge: "e2e-challenge-token",
    expectedVerifyToken: VERIFY_TOKEN,
  });
  record("1. Webhook verification", challenge === "e2e-challenge-token", `challenge=${challenge ?? "null"}`);

  const inboundMessageId = `wamid.inbound-${randomUUID()}`;
  const routeStart = performance.now();
  const inboundRoute = await channelPlatform.router.routeWebhook(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    companyChannelId,
    channelKey: "whatsapp",
    rawPayload: inboundPayload(inboundMessageId),
    executeAi: true,
    aiAssistantId,
    runtimeConfig: { providerConnectionId, executionPolicy: { streaming: false } },
  });
  const routeMs = performance.now() - routeStart;

  record(
    "2. Incoming WhatsApp message routed",
    inboundRoute.kind === "inbound" && Boolean(inboundRoute.result.inboundEventId),
    inboundRoute.kind === "inbound" ? `inboundEventId=${inboundRoute.result.inboundEventId}` : "unexpected status-only route",
  );

  const inboundResult = inboundRoute.kind === "inbound" ? inboundRoute.result : null;
  record(
    "3. Conversation session resolved",
    Boolean(inboundResult?.conversationId && inboundResult.channelSessionId),
    `conversationId=${inboundResult?.conversationId ?? "n/a"}`,
  );
  record(
    "4. Runtime execution triggered",
    Boolean(inboundResult?.runtimeExecutionId && inboundResult.responseContent),
    `executionId=${inboundResult?.runtimeExecutionId ?? "n/a"}`,
    { responsePreview: inboundResult?.responseContent?.slice(0, 120) },
  );
  record(
    "5. Outbound WhatsApp delivery",
    inboundResult?.outboundDeliveryId != null && graphRequests.some((req) => String(req.url).includes("/messages")),
    `deliveryId=${inboundResult?.outboundDeliveryId ?? "n/a"}, graphCalls=${graphRequests.length}`,
  );

  const delivered = await channelPlatform.router.routeWebhook(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    companyChannelId,
    channelKey: "whatsapp",
    rawPayload: statusPayload("wamid.outbound-e2e-1", "delivered"),
  });
  record(
    "6. Delivery status update",
    delivered.kind === "delivery_status" && delivered.result.updated === true,
    delivered.kind === "delivery_status"
      ? `status=${delivered.result.deliveryStatus}`
      : "delivery webhook not routed as status",
  );

  const read = await channelPlatform.router.routeWebhook(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    companyChannelId,
    channelKey: "whatsapp",
    rawPayload: statusPayload("wamid.outbound-e2e-1", "read"),
  });
  record(
    "7. Read receipt tracked",
    read.kind === "delivery_status" && read.result.deliveryStatus === "read",
    read.kind === "delivery_status" ? `status=${read.result.deliveryStatus}` : "read receipt not applied",
  );

  const mediaRoute = await channelPlatform.router.routeWebhook(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    companyChannelId,
    channelKey: "whatsapp",
    rawPayload: {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: PHONE_NUMBER_ID },
                messages: [
                  {
                    from: WA_USER,
                    id: `wamid.media-${randomUUID()}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "image",
                    image: { id: "media-001", mime_type: "image/jpeg", caption: "Policy document" },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    executeAi: false,
    aiAssistantId,
  });
  record(
    "8. Media inbound handling",
    mediaRoute.kind === "inbound" && Boolean(mediaRoute.result.inboundEventId),
    mediaRoute.kind === "inbound" ? `inboundEventId=${mediaRoute.result.inboundEventId}` : "media route failed",
  );

  try {
    await channelPlatform.router.routeWebhook(ctx as never, {
      companyId: DEMO_BETA_COMPANY_ID,
      companyChannelId,
      channelKey: "whatsapp",
      rawPayload: { object: "whatsapp_business_account", entry: [] },
    });
    record("9. Error handling for empty webhook", false, "expected validation error was not thrown");
  } catch (error) {
    record(
      "9. Error handling for empty webhook",
      error instanceof Error && /routable events/i.test(error.message),
      error instanceof Error ? error.message : "unknown error",
    );
  }

  const totalMs = performance.now() - startedAt;
  const passed = results.filter((item) => item.pass).length;
  const failed = results.length - passed;

  const reportDir = resolve(root, "docs/architecture");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    resolve(reportDir, "phase-7-whatsapp-adapter-e2e-report.json"),
    JSON.stringify({ passed, failed, total: results.length, routeMs, totalMs, results }, null, 2),
  );
  writeFileSync(
    resolve(reportDir, "phase-7-whatsapp-adapter-e2e-report.md"),
    [
      "# Phase 7 — WhatsApp Cloud Adapter E2E Verification Report",
      "",
      `**Generated:** ${new Date().toISOString()}`,
      `**Target:** ${config.url}`,
      "",
      "## Executive Summary",
      "",
      failed === 0
        ? "WhatsApp Cloud Adapter verification passed. Webhook verification, inbound routing, runtime execution, outbound Graph API delivery, delivery status updates, read receipts, and media inbound handling all completed successfully through the Enterprise Channel Platform."
        : "WhatsApp verification completed with failures — see scenario details below.",
      "",
      "## Architecture Decisions",
      "",
      "1. **ChannelAdapterPort implementation** — WhatsApp integrates exclusively through `WhatsAppCloudAdapter`; no direct Runtime or Conversation Engine access.",
      "2. **Webhook routing** — Meta payloads enter via `ChannelRouter.routeWebhook()`; status/read events update delivery records through `DeliveryStatusPipeline`.",
      "3. **Configuration inversion** — Tenant credentials (`phoneNumberId`, `accessToken`, `verifyToken`) live in `company_channels.configuration`.",
      "4. **Mock Graph API in E2E** — Outbound sends are verified without calling Meta production endpoints.",
      "",
      "## Test Results",
      "",
      `- **Passed:** ${passed}`,
      `- **Failed:** ${failed}`,
      `- **Total:** ${results.length}`,
      "",
      "## Performance Observations",
      "",
      `- Inbound + runtime + outbound route: **${routeMs.toFixed(0)} ms**`,
      `- Total E2E script duration: **${totalMs.toFixed(0)} ms**`,
      "",
      "## Known Limitations",
      "",
      "- Media inbound stores WhatsApp media IDs; automatic media download requires configured Graph API access.",
      "- Template sends require pre-approved templates in the Meta Business account.",
      "- Webhook signature validation (`X-Hub-Signature-256`) is optional and not enforced in E2E.",
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

  console.log(`\nWhatsApp E2E: ${passed}/${results.length} passed (${totalMs.toFixed(0)} ms total)`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
