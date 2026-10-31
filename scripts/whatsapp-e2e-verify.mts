/**
 * WhatsApp Cloud Adapter end-to-end verification (LOCAL-ONLY, DEMO Beta).
 * Run: VALUEOR_ENV=local npm run whatsapp:e2e (from artifacts/login-app)
 *
 * Safety: aborts unless Supabase URL is exactly http://127.0.0.1:54321.
 * Never calls Meta Graph or real OpenAI (injected mocks). Never touches
 * company_whatsapp_settings or ValueOR/CVP rows.
 */
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createAIObservabilityServices } from "../lib/ai-observability/src/index.ts";
import { createConversationServices } from "../lib/ai-conversation/src/index.ts";
import {
  createAIExecutionServices,
  createEnterpriseRuntimeIntegrations,
} from "../lib/ai-execution-engine/src/index.ts";
import { createIntentEngineServices } from "../lib/ai-intent-engine/src/index.ts";
import {
  AIProviderFactory,
  createAIGatewayServices,
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
const E2E_WA_ACCESS_TOKEN = "e2e-wa-token";
const E2E_OPENAI_API_KEY = "e2e-mock-key";
const E2E_API_VERSION = "v21.0";
const REQUIRED_LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const WA_USER = "15551234567";
const MOCK_CHAT_RESPONSE =
  "Thanks for your WhatsApp message. Enterprise MFA policy requires multi-factor authentication.";
const PROHIBITED_PHONE_NUMBER_IDS = new Set([
  "1168042419733416",
  "1214681355059951",
  "1285847481276306",
]);

type Result = { scenario: string; pass: boolean; detail: string; evidence?: Record<string, unknown> };
type CleanupFailure = { table: string; id: string; error: string };

type CreatedIds = {
  executionPolicyIds: string[];
  aiProviderConnectionIds: string[];
  companyChannelIds: string[];
  inboundEventIds: string[];
  channelSessionIds: string[];
  conversationIds: string[];
  conversationMessageIds: string[];
  deliveryEventIds: string[];
  aiExecutionIds: string[];
  aiExecutionMetricIds: string[];
  aiTraceIds: string[];
  aiTraceSpanIds: string[];
  aiExecutionAnalyticsIds: string[];
};

const results: Result[] = [];
const graphRequests: Array<{ url: string; body: unknown }> = [];

function record(scenario: string, pass: boolean, detail: string, evidence?: Record<string, unknown>) {
  results.push({ scenario, pass, detail, evidence });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${scenario} — ${detail}`);
}

function safetyAbort(message: string): never {
  throw new Error(`SAFETY: ${message}`);
}

function normalizeSupabaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function assertExactLocalSupabaseUrl(url: string): string {
  const normalized = normalizeSupabaseUrl(url);
  if (/supabase\.co/i.test(normalized)) {
    safetyAbort(`Rejected supabase.co URL (got ${normalized}). Local E2E requires ${REQUIRED_LOCAL_SUPABASE_URL}.`);
  }
  if (/^https:/i.test(normalized)) {
    safetyAbort(`Rejected https Supabase URL (got ${normalized}). Local E2E requires ${REQUIRED_LOCAL_SUPABASE_URL}.`);
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === "localhost") {
      safetyAbort(`Rejected localhost Supabase host. Use exactly ${REQUIRED_LOCAL_SUPABASE_URL}.`);
    }
  } catch {
    safetyAbort(`Invalid Supabase URL: ${normalized}`);
  }
  if (normalized !== REQUIRED_LOCAL_SUPABASE_URL) {
    safetyAbort(`Supabase URL must be exactly ${REQUIRED_LOCAL_SUPABASE_URL} (got ${normalized}).`);
  }
  return normalized;
}

function assertValueorEnvLocal(): void {
  const raw = String(process.env.VALUEOR_ENV ?? "").trim().toLowerCase();
  if (raw !== "local") {
    safetyAbort(`VALUEOR_ENV must be exactly "local" before any DB operation (got "${process.env.VALUEOR_ENV ?? ""}").`);
  }
}

function assertDemoBetaCompanyId(companyId: string, context: string): void {
  if (companyId !== DEMO_BETA_COMPANY_ID) {
    safetyAbort(`DEMO-only guard: refused companyId=${companyId} in ${context}; expected DEMO Beta ${DEMO_BETA_COMPANY_ID}.`);
  }
}

function assertAllowedPhoneNumberId(phoneNumberId: string, context: string): void {
  if (phoneNumberId !== PHONE_NUMBER_ID) {
    safetyAbort(`Refused phoneNumberId=${phoneNumberId} in ${context}; expected ${PHONE_NUMBER_ID}.`);
  }
  if (PROHIBITED_PHONE_NUMBER_IDS.has(phoneNumberId)) {
    safetyAbort(`Refused prohibited production phoneNumberId=${phoneNumberId} in ${context}.`);
  }
}

function emptyCreatedIds(): CreatedIds {
  return {
    executionPolicyIds: [],
    aiProviderConnectionIds: [],
    companyChannelIds: [],
    inboundEventIds: [],
    channelSessionIds: [],
    conversationIds: [],
    conversationMessageIds: [],
    deliveryEventIds: [],
    aiExecutionIds: [],
    aiExecutionMetricIds: [],
    aiTraceIds: [],
    aiTraceSpanIds: [],
    aiExecutionAnalyticsIds: [],
  };
}

function trackId(list: string[], id: string | null | undefined): void {
  if (id && !list.includes(id)) list.push(id);
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

function createE2EWhatsAppCredentialsLoader() {
  return {
    async loadByCompanyId(companyId: string) {
      assertDemoBetaCompanyId(companyId, "e2eWhatsAppCredentialsLoader.loadByCompanyId");
      return {
        phoneNumberId: PHONE_NUMBER_ID,
        accessToken: E2E_WA_ACCESS_TOKEN,
        verifyToken: VERIFY_TOKEN,
        apiVersion: E2E_API_VERSION,
      };
    },
  };
}

function createE2EOpenAIFactory(
  definitionRepo: ReturnType<typeof createSupabaseAIProviderDefinitionRepository>,
  mockOpenAIFetch: typeof fetch,
) {
  return new AIProviderFactory(
    definitionRepo,
    createAIProviderAdapterRegistry({
      ...createStubAdapters(),
      openai: (configuration) => {
        const merged = {
          ...configuration,
          model: "gpt-4o-mini",
          apiKey: E2E_OPENAI_API_KEY,
          execution_policy: { streaming: false, ...(configuration as { execution_policy?: object }).execution_policy },
        };
        if (merged.apiKey !== E2E_OPENAI_API_KEY) {
          safetyAbort(`OpenAI mock required apiKey=${E2E_OPENAI_API_KEY}; refused ${String(merged.apiKey)}.`);
        }
        return createOpenAIChatAdapter(merged, { fetchFn: mockOpenAIFetch });
      },
    }),
  );
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

async function ensureExecutionPolicy(
  client: SupabaseClient,
  created: CreatedIds,
): Promise<string> {
  assertDemoBetaCompanyId(DEMO_BETA_COMPANY_ID, "ensureExecutionPolicy");
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
  trackId(created.executionPolicyIds, data.id);
  return data.id;
}

async function ensureAIProviderConnection(
  client: SupabaseClient,
  ctx: ReturnType<typeof makeContext>,
  mockOpenAIFetch: typeof fetch,
  created: CreatedIds,
): Promise<string> {
  assertDemoBetaCompanyId(ctx.companyId, "ensureAIProviderConnection");
  const definitionRepo = createSupabaseAIProviderDefinitionRepository(client);
  const connectionRepo = createSupabaseAIProviderConnectionRepository(client);
  const factory = createE2EOpenAIFactory(definitionRepo, mockOpenAIFetch);
  const registry = new AIProviderRegistryService(definitionRepo, connectionRepo, factory);
  const connections = await registry.listConnections(ctx as never, { companyId: DEMO_BETA_COMPANY_ID });
  const existing = connections.find(
    (item) =>
      item.ai_provider_definition?.key === "openai" &&
      item.is_enabled &&
      item.display_name === "E2E WhatsApp OpenAI",
  );
  if (existing) return existing.id;
  const provider = await definitionRepo.findByKey("openai");
  if (!provider) throw new Error("OpenAI provider definition missing.");
  const createdConnection = await registry.createConnection(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    providerId: provider.id,
    displayName: "E2E WhatsApp OpenAI",
    configuration: { model: "gpt-4o-mini", apiKey: E2E_OPENAI_API_KEY, execution_policy: { streaming: false } },
    isEnabled: true,
    isDefault: false,
  });
  trackId(created.aiProviderConnectionIds, createdConnection.id);
  return createdConnection.id;
}

type ChannelEnsureResult = {
  companyChannelId: string;
  createdNew: boolean;
  previousConfiguration: Record<string, unknown> | null;
};

async function ensureWhatsAppCompanyChannel(
  client: SupabaseClient,
  ctx: ReturnType<typeof makeContext>,
  created: CreatedIds,
): Promise<ChannelEnsureResult> {
  assertDemoBetaCompanyId(ctx.companyId, "ensureWhatsAppCompanyChannel");
  const channelRegistry = createChannelRegistryServices(client);
  const existing = await channelRegistry.companyChannels.listCompanyChannels(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    channelKey: "whatsapp",
  });

  const e2eChannel = existing.find((row) => {
    const phone = String((row.configuration as { phoneNumberId?: string } | null)?.phoneNumberId ?? "");
    return phone === PHONE_NUMBER_ID || row.display_name === "E2E WhatsApp";
  });

  if (e2eChannel) {
    const existingPhone = String(
      (e2eChannel.configuration as { phoneNumberId?: string } | null)?.phoneNumberId ?? "",
    );
    if (existingPhone && PROHIBITED_PHONE_NUMBER_IDS.has(existingPhone)) {
      safetyAbort(`Refused to modify channel ${e2eChannel.id} with prohibited phoneNumberId=${existingPhone}.`);
    }
    if (e2eChannel.company_id !== DEMO_BETA_COMPANY_ID) {
      safetyAbort(`Refused cross-tenant channel ${e2eChannel.id} company=${e2eChannel.company_id}.`);
    }

    const previousConfiguration = structuredClone(
      (e2eChannel.configuration ?? {}) as Record<string, unknown>,
    );
    const e2eConfiguration = {
      phoneNumberId: PHONE_NUMBER_ID,
      accessToken: E2E_WA_ACCESS_TOKEN,
      verifyToken: VERIFY_TOKEN,
      apiVersion: E2E_API_VERSION,
    };
    assertAllowedPhoneNumberId(e2eConfiguration.phoneNumberId, "ensureWhatsAppCompanyChannel.update");

    await channelRegistry.companyChannels.updateConfiguration(ctx as never, {
      companyChannelId: e2eChannel.id,
      configuration: e2eConfiguration,
      provider: "meta",
    });
    return {
      companyChannelId: e2eChannel.id,
      createdNew: false,
      previousConfiguration,
    };
  }

  const { data: channelType } = await client
    .from("communication_channels")
    .select("id")
    .eq("key", "whatsapp")
    .maybeSingle();
  if (!channelType?.id) throw new Error("whatsapp communication channel missing.");

  const e2eConfiguration = {
    phoneNumberId: PHONE_NUMBER_ID,
    accessToken: E2E_WA_ACCESS_TOKEN,
    verifyToken: VERIFY_TOKEN,
    apiVersion: E2E_API_VERSION,
  };
  assertAllowedPhoneNumberId(e2eConfiguration.phoneNumberId, "ensureWhatsAppCompanyChannel.create");

  const createdChannel = await channelRegistry.companyChannels.createConnection(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    channelId: channelType.id,
    displayName: "E2E WhatsApp",
    provider: "meta",
    configuration: e2eConfiguration,
    isEnabled: true,
    isDefault: false,
    status: "active",
    healthStatus: "connected",
  });
  trackId(created.companyChannelIds, createdChannel.id);
  return {
    companyChannelId: createdChannel.id,
    createdNew: true,
    previousConfiguration: null,
  };
}

async function ensureAssistant(client: SupabaseClient) {
  assertDemoBetaCompanyId(DEMO_BETA_COMPANY_ID, "ensureAssistant");
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

function assertWhatsAppMockInstalled(mockWhatsAppFetch: typeof fetch): void {
  if (!mockWhatsAppFetch) {
    safetyAbort("WhatsApp Graph mock fetch is absent.");
  }
  if (mockWhatsAppFetch === globalThis.fetch) {
    safetyAbort("WhatsApp Graph mock must not be globalThis.fetch.");
  }
}

function assertOpenAIMockInstalled(mockOpenAIFetch: typeof fetch): void {
  if (!mockOpenAIFetch) {
    safetyAbort("OpenAI mock fetch is absent.");
  }
  if (mockOpenAIFetch === globalThis.fetch) {
    safetyAbort("OpenAI mock must not be globalThis.fetch.");
  }
}

function printSafetyBanner(supabaseUrl: string): void {
  console.log("LOCAL_ONLY=true");
  console.log(`SUPABASE_URL=${supabaseUrl}`);
  console.log("DEMO_BETA=true");
  console.log(`PHONE_NUMBER_ID=${PHONE_NUMBER_ID}`);
  console.log("WHATSAPP_GRAPH_MOCK=true");
  console.log("OPENAI_MOCK=true");
}

function formatWebhookRouteDetail(route: {
  kind: string;
  reason?: string;
  result?: unknown;
  results?: Array<{ kind: string; reason?: string }>;
  primary?: unknown;
}): string {
  if (route.kind === "batch") {
    const kinds = (route.results ?? []).map((item) => item.kind + (item.reason ? `:${item.reason}` : ""));
    return `kind=batch eventCount=${route.results?.length ?? 0} results=[${kinds.join(", ")}]`;
  }
  if (route.kind === "ignored") {
    return `kind=ignored reason=${route.reason ?? "n/a"}`;
  }
  if (route.kind === "delivery_status") {
    const result = route.result as { deliveryStatus?: string; updated?: boolean } | undefined;
    return `kind=delivery_status updated=${String(result?.updated)} status=${result?.deliveryStatus ?? "n/a"}`;
  }
  if (route.kind === "inbound") {
    const result = route.result as { inboundEventId?: string } | undefined;
    return `kind=inbound inboundEventId=${result?.inboundEventId ?? "n/a"}`;
  }
  return `kind=${route.kind}`;
}

function assertE2ECommercialEntitlementInstalled(ports: {
  channelCommercialEntitlement?: { checkAccess?: unknown };
}): void {
  const port = ports.channelCommercialEntitlement;
  if (!port) {
    safetyAbort("E2E channelCommercialEntitlement stub is missing on channelPorts.");
  }
  if (typeof port.checkAccess !== "function") {
    safetyAbort("E2E channelCommercialEntitlement.checkAccess must be a function.");
  }
}


function trackInboundResult(
  created: CreatedIds,
  result: {
    inboundEventId?: string | null;
    conversationId?: string | null;
    channelSessionId?: string | null;
    outboundDeliveryId?: string | null;
    runtimeExecutionId?: string | null;
  } | null,
): void {
  if (!result) return;
  trackId(created.inboundEventIds, result.inboundEventId);
  trackId(created.conversationIds, result.conversationId);
  trackId(created.channelSessionIds, result.channelSessionId);
  trackId(created.deliveryEventIds, result.outboundDeliveryId);
  trackId(created.aiExecutionIds, result.runtimeExecutionId);
}

async function collectIdsByForeignKey(
  client: SupabaseClient,
  table: string,
  foreignKey: string,
  parentIds: string[],
  into: string[],
): Promise<void> {
  if (parentIds.length === 0) return;
  try {
    const { data, error } = await client.from(table).select("id").in(foreignKey, parentIds);
    if (error) return;
    for (const row of data ?? []) trackId(into, row.id as string);
  } catch {
    // Optional schema columns/tables — skip rather than broaden cleanup.
  }
}

async function collectDependentIds(client: SupabaseClient, created: CreatedIds): Promise<void> {
  await collectIdsByForeignKey(
    client,
    "conversation_messages",
    "conversation_id",
    created.conversationIds,
    created.conversationMessageIds,
  );
  await collectIdsByForeignKey(
    client,
    "ai_execution_metrics",
    "execution_id",
    created.aiExecutionIds,
    created.aiExecutionMetricIds,
  );
  await collectIdsByForeignKey(
    client,
    "ai_execution_analytics",
    "execution_id",
    created.aiExecutionIds,
    created.aiExecutionAnalyticsIds,
  );
  await collectIdsByForeignKey(
    client,
    "ai_traces",
    "execution_id",
    created.aiExecutionIds,
    created.aiTraceIds,
  );
  await collectIdsByForeignKey(
    client,
    "ai_trace_spans",
    "trace_id",
    created.aiTraceIds,
    created.aiTraceSpanIds,
  );
}

async function deleteIds(
  client: SupabaseClient,
  table: string,
  ids: string[],
  failures: CleanupFailure[],
  mode: "hard" | "soft" = "hard",
): Promise<void> {
  for (const id of ids) {
    const result =
      mode === "soft"
        ? await client
            .from(table)
            .update({
              deleted_at: new Date().toISOString(),
              ...(table === "company_channels"
                ? { is_enabled: false, status: "disabled" }
                : {}),
            })
            .eq("id", id)
        : await client.from(table).delete().eq("id", id);
    if (result.error) {
      failures.push({ table, id, error: result.error.message });
    }
  }
}

async function runCleanup(
  client: SupabaseClient,
  created: CreatedIds,
  channelMeta: ChannelEnsureResult | null,
  ctx: ReturnType<typeof makeContext> | null,
): Promise<{ ok: boolean; failures: CleanupFailure[] }> {
  const failures: CleanupFailure[] = [];
  await collectDependentIds(client, created);

  await deleteIds(client, "channel_delivery_events", created.deliveryEventIds, failures);
  // conversation_messages are append-only. Leave the rows and retire the parent.
  await deleteIds(client, "channel_inbound_events", created.inboundEventIds, failures);
  await deleteIds(client, "channel_sessions", created.channelSessionIds, failures);
  await deleteIds(client, "conversations", created.conversationIds, failures, "soft");
  await deleteIds(client, "ai_execution_metrics", created.aiExecutionMetricIds, failures);
  await deleteIds(client, "ai_trace_spans", created.aiTraceSpanIds, failures);
  await deleteIds(client, "ai_execution_analytics", created.aiExecutionAnalyticsIds, failures);
  await deleteIds(client, "ai_traces", created.aiTraceIds, failures);
  await deleteIds(client, "ai_executions", created.aiExecutionIds, failures);
  await deleteIds(client, "ai_provider_connections", created.aiProviderConnectionIds, failures, "soft");
  await deleteIds(client, "company_channels", created.companyChannelIds, failures, "soft");
  await deleteIds(client, "execution_policies", created.executionPolicyIds, failures);

  if (channelMeta && !channelMeta.createdNew && channelMeta.previousConfiguration && ctx) {
    assertDemoBetaCompanyId(ctx.companyId, "cleanup.restoreChannelConfiguration");
    const channelRegistry = createChannelRegistryServices(client);
    try {
      await channelRegistry.companyChannels.updateConfiguration(ctx as never, {
        companyChannelId: channelMeta.companyChannelId,
        configuration: channelMeta.previousConfiguration,
      });
    } catch (error) {
      failures.push({
        table: "company_channels",
        id: channelMeta.companyChannelId,
        error: error instanceof Error ? `restore failed: ${error.message}` : "restore failed",
      });
    }
  }

  return { ok: failures.length === 0, failures };
}

async function main() {
  const startedAt = performance.now();
  const created = emptyCreatedIds();
  let client: SupabaseClient | null = null;
  let ctx: ReturnType<typeof makeContext> | null = null;
  let channelMeta: ChannelEnsureResult | null = null;
  let supabaseTargetUrl = "";
  let cleanupStatus: { ok: boolean; failures: CleanupFailure[] } = { ok: true, failures: [] };
  let scenarioFailed = false;

  const mockWhatsAppFetch = createMockWhatsAppFetch();
  const mockOpenAIFetch = createMockOpenAIFetch();
  assertWhatsAppMockInstalled(mockWhatsAppFetch);
  assertOpenAIMockInstalled(mockOpenAIFetch);

  try {
    assertValueorEnvLocal();

    const env = loadSupabaseEnv(root);
    const config = resolveSupabaseConfig(env);
    if (!config) safetyAbort("Supabase configuration not found for local E2E.");
    supabaseTargetUrl = assertExactLocalSupabaseUrl(config.url);

    const serviceRoleKey =
      env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!serviceRoleKey) {
      safetyAbort("Local SUPABASE_SERVICE_ROLE_KEY is required for the WhatsApp turn lease.");
    }
    const turnLockClient = createClient(supabaseTargetUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Hydrate Vite browser-env names for login-app modules (e.g. observability-adapter → supabase.ts).
    // Values come only from the already Local-guarded config — never from a second .env read.
    process.env.VITE_SUPABASE_URL = config.url;
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = config.key;

    printSafetyBanner(supabaseTargetUrl);

    const signedIn = await signIn(config.url, config.key);
    client = turnLockClient;
    ctx = makeContext(signedIn.userId);
    assertDemoBetaCompanyId(ctx.companyId, "main.context");

    await ensureExecutionPolicy(client, created);

    const providerConnectionId = await ensureAIProviderConnection(
      client,
      ctx,
      mockOpenAIFetch,
      created,
    );
    channelMeta = await ensureWhatsAppCompanyChannel(client, ctx, created);
    const companyChannelId = channelMeta.companyChannelId;
    const aiAssistantId = await ensureAssistant(client);

    assertAllowedPhoneNumberId(PHONE_NUMBER_ID, "main.preScenario");
    assertWhatsAppMockInstalled(mockWhatsAppFetch);
    assertOpenAIMockInstalled(mockOpenAIFetch);

    console.log(
      JSON.stringify(
        {
          safety: {
            LOCAL_ONLY: true,
            SUPABASE_URL: supabaseTargetUrl,
            DEMO_BETA: true,
            DEMO_BETA_COMPANY_ID,
            companyChannelId,
            PHONE_NUMBER_ID,
            WHATSAPP_GRAPH_MOCK: true,
            OPENAI_MOCK: true,
          },
        },
        null,
        2,
      ),
    );

    const conversationServices = createConversationServices(client);
    const intentServices = createIntentEngineServices(client);
    const promptServices = createPromptOrchestratorServices(client);
    const vectorQueryServices = createVectorQueryServices(client);
    const retrievalServices = createRetrievalServices(client);
    const channelRegistryServices = createChannelRegistryServices(client);

    const definitionRepo = createSupabaseAIProviderDefinitionRepository(client);
    const connectionRepo = createSupabaseAIProviderConnectionRepository(client);
    const aiFactory = createE2EOpenAIFactory(definitionRepo, mockOpenAIFetch);
    const executionServices = createAIExecutionServices(
      client,
      createEnterpriseRuntimeIntegrations({
        promptRuntime: promptServices.runtime,
        gateway: createAIGatewayServices(aiFactory).gateway,
        knowledge: retrievalServices.knowledge,
      }),
    );
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
      { promptMode: "webhook" },
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

    // E2E-only allow-all commercial gate. Production wires a real port in create-webhook-platform.
    // Without this, ChannelRouter returns { kind: "ignored", reason: "channel_not_entitled" }.
    channelPorts.channelCommercialEntitlement = {
      checkAccess: async () => ({
        allowed: true,
        reason: "entitled" as const,
        featureCode: "whatsapp_channel",
      }),
    };
    // E2E-only WhatsApp outbound commercial port. Production wires createWhatsAppMessagesCommercialPort.
    // Without this, OutboundMessagePipeline throws DeliveryFailedError before the Graph mock.
    channelPorts.whatsappMessagesCommercial = {
      checkAccess: async () => ({
        allowed: true,
        reason: "entitled" as const,
      }),
      recordUsage: async () => ({
        recorded: true,
        reason: "recorded",
      }),
    };
    assertE2ECommercialEntitlementInstalled(channelPorts);

    const e2eCredentialsLoader = createE2EWhatsAppCredentialsLoader();
    assertWhatsAppMockInstalled(mockWhatsAppFetch);
    const channelPlatform = createChannelPlatformServices(client, {
      ports: channelPorts,
      whatsAppFetchFn: mockWhatsAppFetch,
      whatsAppCredentialsLoader: e2eCredentialsLoader,
      conversationTurnLockClient: turnLockClient,
    });

    const challenge = verifyWhatsAppWebhookChallenge({
      mode: "subscribe",
      verifyToken: VERIFY_TOKEN,
      challenge: "e2e-challenge-token",
      expectedVerifyToken: VERIFY_TOKEN,
    });
    record("1. Webhook verification", challenge === "e2e-challenge-token", `challenge=${challenge ?? "null"}`);

    assertWhatsAppMockInstalled(mockWhatsAppFetch);
    assertDemoBetaCompanyId(DEMO_BETA_COMPANY_ID, "routeWebhook.inbound");

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
      inboundRoute.kind === "inbound"
        ? `inboundEventId=${inboundRoute.result.inboundEventId}`
        : `unexpected route: ${formatWebhookRouteDetail(inboundRoute)}`,
    );

    const inboundResult = inboundRoute.kind === "inbound" ? inboundRoute.result : null;
    trackInboundResult(created, inboundResult);

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

    assertWhatsAppMockInstalled(mockWhatsAppFetch);
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
        : `unexpected route: ${formatWebhookRouteDetail(delivered)}`,
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
      read.kind === "delivery_status"
        ? `status=${read.result.deliveryStatus}`
        : `unexpected route: ${formatWebhookRouteDetail(read)}`,
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
    if (mediaRoute.kind === "inbound") trackInboundResult(created, mediaRoute.result);
    record(
      "8. Media inbound handling",
      mediaRoute.kind === "inbound" && Boolean(mediaRoute.result.inboundEventId),
      mediaRoute.kind === "inbound"
        ? `inboundEventId=${mediaRoute.result.inboundEventId}`
        : `unexpected route: ${formatWebhookRouteDetail(mediaRoute)}`,
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
    scenarioFailed = failed > 0;
    console.log(
      `\nWhatsApp E2E scenarios: ${passed}/${results.length} passed (${totalMs.toFixed(0)} ms total; route=${routeMs.toFixed(0)} ms)`,
    );
  } catch (error) {
    scenarioFailed = true;
    throw error;
  } finally {
    if (client) {
      cleanupStatus = await runCleanup(client, created, channelMeta, ctx);
      console.log(
        `Cleanup: ${cleanupStatus.ok ? "OK" : "FAILED"}` +
          (cleanupStatus.failures.length
            ? ` failures=${JSON.stringify(cleanupStatus.failures)}`
            : ""),
      );
    }

    const reportDir = resolve(root, "docs/architecture");
    mkdirSync(reportDir, { recursive: true });
    const reportPayload = {
      supabaseTargetUrl: supabaseTargetUrl || "(aborted before resolve)",
      demoBetaCompanyId: DEMO_BETA_COMPANY_ID,
      companyChannelId: channelMeta?.companyChannelId ?? null,
      phoneNumberId: PHONE_NUMBER_ID,
      createdIds: created,
      passed: results.filter((item) => item.pass).length,
      failed: results.filter((item) => !item.pass).length,
      total: results.length,
      results,
      cleanupStatus,
      safety: {
        LOCAL_ONLY: true,
        SUPABASE_URL: supabaseTargetUrl || null,
        DEMO_BETA: true,
        WHATSAPP_GRAPH_MOCK: true,
        OPENAI_MOCK: true,
      },
    };
    writeFileSync(
      resolve(reportDir, "phase-7-whatsapp-adapter-e2e-report.json"),
      JSON.stringify(reportPayload, null, 2),
    );
    writeFileSync(
      resolve(reportDir, "phase-7-whatsapp-adapter-e2e-report.md"),
      [
        "# Phase 7 — WhatsApp Cloud Adapter E2E Verification Report (LOCAL-ONLY)",
        "",
        `**Generated:** ${new Date().toISOString()}`,
        `**Target:** ${reportPayload.supabaseTargetUrl}`,
        `**DEMO Beta company:** ${DEMO_BETA_COMPANY_ID}`,
        `**Channel ID:** ${reportPayload.companyChannelId ?? "n/a"}`,
        `**phoneNumberId:** ${PHONE_NUMBER_ID}`,
        `**Cleanup:** ${cleanupStatus.ok ? "OK" : "FAILED"}`,
        "",
        "## Created IDs",
        "",
        "```json",
        JSON.stringify(created, null, 2),
        "```",
        "",
        "## Cleanup failures",
        "",
        "```json",
        JSON.stringify(cleanupStatus.failures, null, 2),
        "```",
        "",
        "## Test Results",
        "",
        `- **Passed:** ${reportPayload.passed}`,
        `- **Failed:** ${reportPayload.failed}`,
        `- **Total:** ${reportPayload.total}`,
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

    if (!cleanupStatus.ok) {
      process.exitCode = 1;
    } else if (scenarioFailed) {
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
