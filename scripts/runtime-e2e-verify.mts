/**
 * Enterprise AI Runtime end-to-end verification.
 * Run: npm run runtime:e2e (from artifacts/login-app)
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
  createSupabaseAIProviderConnectionRepository,
  createSupabaseAIProviderDefinitionRepository,
  createStubAdapters,
} from "../lib/ai-provider-layer/src/index.ts";
import { AIProviderHealthService } from "../lib/ai-provider-layer/src/services/ai-provider-health-service.ts";
import { AIProviderRegistryService } from "../lib/ai-provider-layer/src/services/ai-provider-registry-service.ts";
import { createPromptOrchestratorServices } from "../lib/ai-prompt-orchestrator/src/index.ts";
import {
  EmbeddingProviderFactory,
  createEmbeddingProviderAdapterRegistry,
  createOpenAIEmbeddingAdapter,
} from "../lib/embedding-platform/src/index.ts";
import {
  createSupabaseEmbeddingProviderConnectionRepository,
  createSupabaseEmbeddingProviderDefinitionRepository,
} from "../lib/embedding-platform/src/repositories/supabase-embedding-repositories.ts";
import { EmbeddingProviderRegistryService } from "../lib/embedding-platform/src/services/embedding-provider-registry-service.ts";
import { createRetrievalServices } from "../lib/retrieval-engine/src/index.ts";
import type { ServiceContext as RetrievalServiceContext } from "../lib/retrieval-engine/src/types.ts";
import { createRuntimeIntegrationServices } from "../lib/runtime-integration/src/index.ts";
import { createVectorStoreServices } from "../lib/vector-store/src/index.ts";
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
const DEMO_CONVERSATION_ID = "d0000110-0001-4001-8001-000000000001";
const PLATFORM_OWNER = "demo-platform@vaultos.local";

const FIXTURE_CONTENT =
  "Enterprise MFA policy requires multi-factor authentication for all users accessing sensitive systems.";

const MOCK_CHAT_RESPONSE =
  "Enterprise MFA policy requires multi-factor authentication for all users accessing sensitive systems.";

type Result = { scenario: string; pass: boolean; detail: string; evidence?: Record<string, unknown> };
const results: Result[] = [];

function record(scenario: string, pass: boolean, detail: string, evidence?: Record<string, unknown>) {
  results.push({ scenario, pass, detail, evidence });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${scenario} — ${detail}`);
}

function mockEmbeddingFromText(text: string, dimensions = 8): number[] {
  return Array.from({ length: dimensions }, (_, dim) =>
    Number((((text?.length ?? 0) + dim + 1) / 100).toFixed(6)),
  );
}

function createMockOpenAIFetch() {
  return async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      input?: string | string[];
      stream?: boolean;
      messages?: unknown[];
    };

    if (url.includes("/embeddings")) {
      const inputs = Array.isArray(body.input) ? body.input : [body.input ?? ""];
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: "text-embedding-3-small",
          data: inputs.map((text, index) => ({
            index,
            embedding: mockEmbeddingFromText(text ?? ""),
          })),
          usage: { total_tokens: 16 },
        }),
      } as Response;
    }

    if (body.stream) {
      const chunks = MOCK_CHAT_RESPONSE.split(" ");
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  model: "gpt-4o-mini",
                  choices: [{ delta: { content: `${chunk} ` } }],
                })}\n\n`,
              ),
            );
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                model: "gpt-4o-mini",
                usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
                choices: [{ finish_reason: "stop" }],
              })}\n\n`,
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

async function ensureEmbeddingConnection(client: SupabaseClient, ctx: ReturnType<typeof makeContext>) {
  const definitionRepo = createSupabaseEmbeddingProviderDefinitionRepository(client);
  const connectionRepo = createSupabaseEmbeddingProviderConnectionRepository(client);
  const factory = new EmbeddingProviderFactory(
    definitionRepo,
    createEmbeddingProviderAdapterRegistry({
      openai: (configuration) =>
        createOpenAIEmbeddingAdapter({ apiKey: "e2e-mock-key", dimensions: 8, ...configuration }, {
          fetchFn: createMockOpenAIFetch(),
        }),
    }),
  );
  const registry = new EmbeddingProviderRegistryService(definitionRepo, connectionRepo, factory);

  const connections = await registry.listConnections(ctx as never, { companyId: DEMO_BETA_COMPANY_ID });
  const existing = connections.find((item) => item.embedding_provider_definition?.key === "openai" && item.is_enabled);
  if (existing) return { connectionId: existing.id, registry, factory };

  const provider = await definitionRepo.findByKey("openai");
  if (!provider) throw new Error("OpenAI embedding provider definition not found.");

  const created = await registry.createConnection(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    providerId: provider.id,
    displayName: "E2E Runtime Embeddings",
    configuration: { model: "text-embedding-3-small", apiKey: "e2e-mock-key", dimensions: 8 },
    isEnabled: true,
    isDefault: true,
  });

  return { connectionId: created.id, registry, factory };
}

async function ensureAIProviderConnection(client: SupabaseClient, ctx: ReturnType<typeof makeContext>) {
  const definitionRepo = createSupabaseAIProviderDefinitionRepository(client);
  const connectionRepo = createSupabaseAIProviderConnectionRepository(client);
  const stubAdapters = createStubAdapters();
  const factory = new AIProviderFactory(
    definitionRepo,
    createAIProviderAdapterRegistry({
      ...stubAdapters,
      openai: (configuration) =>
        createOpenAIChatAdapter({ apiKey: "e2e-mock-key", model: "gpt-4o-mini", ...configuration }, {
          fetchFn: createMockOpenAIFetch(),
        }),
    }),
  );
  const registry = new AIProviderRegistryService(definitionRepo, connectionRepo, factory);

  const connections = await registry.listConnections(ctx as never, { companyId: DEMO_BETA_COMPANY_ID });
  const existing = connections.find((item) => item.ai_provider_definition?.key === "openai" && item.is_enabled);
  if (existing) {
    await client
      .from("ai_provider_connections")
      .update({
        is_enabled: true,
        is_default: true,
        configuration: {
          model: "gpt-4o-mini",
          apiKey: "e2e-mock-key",
          execution_policy: { streaming: true, response_format: "text" },
        },
      })
      .eq("id", existing.id);
    return { connectionId: existing.id, registry, factory };
  }

  const provider = await definitionRepo.findByKey("openai");
  if (!provider) throw new Error("OpenAI AI provider definition not found.");

  const created = await registry.createConnection(ctx as never, {
    companyId: DEMO_BETA_COMPANY_ID,
    providerId: provider.id,
    displayName: "E2E Runtime OpenAI Chat",
    configuration: {
      model: "gpt-4o-mini",
      apiKey: "e2e-mock-key",
      execution_policy: { streaming: true, response_format: "text" },
    },
    isEnabled: true,
    isDefault: true,
  });

  return { connectionId: created.id, registry, factory };
}

async function ensureExecutionPolicy(client: SupabaseClient) {
  const { data: existing } = await client
    .from("execution_policies")
    .select("id")
    .eq("company_id", DEMO_BETA_COMPANY_ID)
    .eq("is_default", true)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data, error } = await client
    .from("execution_policies")
    .insert({
      company_id: DEMO_BETA_COMPANY_ID,
      policy_name: "e2e-runtime-default",
      knowledge_retrieval_enabled: true,
      is_default: true,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function ensureIndexedFixture(
  client: SupabaseClient,
  ctx: RetrievalServiceContext,
  vectorStore: ReturnType<typeof createVectorStoreServices>,
  vectorConnectionId: string,
  embeddingConnectionId: string,
) {
  const dimensions = 8;
  const vector = mockEmbeddingFromText(FIXTURE_CONTENT, dimensions);
  const chunkId = randomUUID();
  const documentId = randomUUID();
  const versionId = randomUUID();
  const sourceId = randomUUID();
  const checksum = randomUUID().replace(/-/g, "");

  await client.from("knowledge_sources").insert({
    id: sourceId,
    company_id: DEMO_BETA_COMPANY_ID,
    key: `e2e-runtime-${Date.now()}`,
    display_name: "E2E Runtime Source",
    source_type: "policy",
    is_enabled: true,
    metadata: {},
  });

  await client.from("knowledge_documents").insert({
    id: documentId,
    company_id: DEMO_BETA_COMPANY_ID,
    source_id: sourceId,
    title: "Enterprise MFA Policy",
    language: "en",
    status: "published",
    checksum,
    metadata: { department: "legal", document_type: "policy" },
  });

  await client.from("knowledge_document_versions").insert({
    id: versionId,
    company_id: DEMO_BETA_COMPANY_ID,
    document_id: documentId,
    version_number: 1,
    status: "published",
    checksum,
    metadata: {},
    is_immutable: true,
    published_at: new Date().toISOString(),
  });

  await client.from("knowledge_documents").update({ published_version_id: versionId }).eq("id", documentId);

  await client.from("knowledge_chunks").insert({
    id: chunkId,
    company_id: DEMO_BETA_COMPANY_ID,
    document_id: documentId,
    version_id: versionId,
    content: FIXTURE_CONTENT,
    checksum: randomUUID().replace(/-/g, ""),
    token_count: 18,
    chunk_index: 0,
    chunk_order: 1,
    metadata: { department: "legal" },
  });

  const embeddingId = randomUUID();
  await client.from("knowledge_embeddings").insert({
    id: embeddingId,
    company_id: DEMO_BETA_COMPANY_ID,
    knowledge_chunk_id: chunkId,
    connection_id: embeddingConnectionId,
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions,
    embedding_version: 1,
    vector,
    checksum: randomUUID().replace(/-/g, ""),
    status: "active",
    is_active: true,
    metadata: { source: "e2e-runtime" },
  });

  const collection = await vectorStore.management.provisionCollection(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    connectionId: vectorConnectionId,
    name: `e2e-runtime-${Date.now()}`,
    embeddingVersion: 1,
    dimensions,
    metadata: { source: "e2e-runtime" },
  });

  await vectorStore.management.indexEmbedding(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    collectionId: collection.id,
    knowledgeEmbeddingId: embeddingId,
  });

  return { collection, chunkId, embeddingId };
}

async function ensurePgvectorConnection(
  client: SupabaseClient,
  ctx: RetrievalServiceContext,
  vectorStore: ReturnType<typeof createVectorStoreServices>,
) {
  const { data: provider } = await client
    .from("vector_store_definitions")
    .select("id, key")
    .eq("key", "pgvector")
    .maybeSingle();
  if (!provider) throw new Error("pgvector provider definition not found.");

  const existing = await vectorStore.registry.listConnections(ctx, { companyId: DEMO_BETA_COMPANY_ID });
  const match = existing.find((item) => item.vector_store_definition?.key === "pgvector" && item.is_enabled);
  if (match) return match.id;

  const created = await vectorStore.registry.createConnection(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    providerId: provider.id,
    displayName: "E2E Runtime PGVector",
    configuration: { schema: "public", tablePrefix: "vs_" },
    isEnabled: true,
  });

  return (await vectorStore.registry.activateConnection(ctx, created.id)).id;
}

function createExecutionServices(client: SupabaseClient, providerFactory: AIProviderFactory) {
  const executionRepository = createSupabaseAIExecutionRepository(client);
  const metricsRepository = createSupabaseAIExecutionMetricsRepository(client);
  const promptBuildReader = createSupabasePromptBuildReader(client);
  const connectionReader = createSupabaseProviderConnectionReader(client);
  const policyService = new AIExecutionPolicyService();

  return {
    execution: new AIExecutionService(
      executionRepository,
      metricsRepository,
      promptBuildReader,
      connectionReader,
      providerFactory,
      policyService,
    ),
    policy: policyService,
    metrics: new AIExecutionMetricsService(executionRepository, metricsRepository),
  };
}

async function main() {
  const env = loadSupabaseEnv(root);
  const config = resolveSupabaseConfig(env);
  if (!config) throw new Error("Supabase configuration not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  const { client, userId } = await signIn(config.url, config.key);
  const ctx = makeContext(userId);

  await client.rpc("_demo_set_triggers", { enabled: false });

  await ensureExecutionPolicy(client);

  const embeddingSetup = await ensureEmbeddingConnection(client, ctx);
  const aiProviderSetup = await ensureAIProviderConnection(client, ctx);
  const vectorStore = createVectorStoreServices(client);
  const vectorConnectionId = await ensurePgvectorConnection(client, ctx as RetrievalServiceContext, vectorStore);
  const fixture = await ensureIndexedFixture(
    client,
    ctx as RetrievalServiceContext,
    vectorStore,
    vectorConnectionId,
    embeddingSetup.connectionId,
  );

  const vectorQueryServices = createVectorQueryServices(client);
  const retrievalServices = createRetrievalServices(client, {
    queryEmbeddingPort: {
      async generateQueryEmbedding(innerCtx, input) {
        const connection = await embeddingSetup.registry.getConnection(innerCtx as never, input.connectionId);
        const providerKey = connection.embedding_provider_definition?.key;
        if (!providerKey) throw new Error("Missing embedding provider.");
        const provider = await embeddingSetup.factory.resolve({
          providerKey,
          configuration: { ...connection.configuration, companyId: connection.company_id },
        });
        const result = await provider.generateEmbedding({ text: input.text, model: "text-embedding-3-small" });
        return {
          vector: result.vector,
          dimensions: result.dimensions,
          providerKey: result.providerKey,
          model: result.model,
          mock: result.mock,
        };
      },
    },
    vectorQueryPort: {
      async executeVectorQuery(innerCtx, input) {
        const response = await vectorQueryServices.management.executeQuery(innerCtx as never, {
          companyId: input.companyId,
          connectionId: input.connectionId,
          collectionId: input.collectionId,
          queryVector: input.queryVector,
          policyId: input.policyId,
          topK: input.topK,
          minimumScore: input.minimumScore,
          metadataFilters: input.metadataFilters as never,
          correlationId: input.correlationId,
        });
        return {
          executionId: response.executionId,
          correlationId: response.correlationId,
          executionTimeMs: response.executionTimeMs,
          provider: response.provider,
          collectionId: response.collectionId,
          policyId: response.policyId,
          resultCount: response.resultCount,
        };
      },
    },
  });

  const conversationServices = createConversationServices(client);
  const intentServices = createIntentEngineServices(client);
  const promptServices = createPromptOrchestratorServices(client);
  const executionServices = createExecutionServices(client, aiProviderSetup.factory);
  const aiProviderConnectionRepo = createSupabaseAIProviderConnectionRepository(client);
  const providerServices = {
    registry: aiProviderSetup.registry,
    factory: aiProviderSetup.factory,
    health: new AIProviderHealthService(aiProviderConnectionRepo, aiProviderSetup.factory),
  };

  const { createRuntimeEnginePortsWithContext } = await import(
    "../artifacts/login-app/src/lib/runtime-integration/engine-ports.ts"
  );
  const { createRuntimeObservabilityPort } = await import(
    "../artifacts/login-app/src/lib/runtime-integration/observability-adapter.ts"
  );

  const observabilityServices = createAIObservabilityServices(client);
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
    ctx,
  );

  const runtime = createRuntimeIntegrationServices(client, {
    ports,
    telemetry: createRuntimeObservabilityPort(
      {
        trace: observabilityServices.trace,
        analytics: observabilityServices.analytics,
      },
      ctx,
    ),
  });

  const userQuestion = "What is the enterprise MFA policy for sensitive systems?";
  const streamChunks: string[] = [];
  const correlationId = randomUUID();
  const runtimeStart = performance.now();

  const response = await runtime.coordinator.execute(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    conversationId: DEMO_CONVERSATION_ID,
    messageText: userQuestion,
    correlationId,
    providerConnectionId: aiProviderSetup.connectionId,
    knowledgeRetrieval: {
      embeddingConnectionId: embeddingSetup.connectionId,
      vectorStoreConnectionId: vectorConnectionId,
      collectionId: fixture.collection.id,
    },
    executionPolicy: { streaming: true },
    onStreamChunk: (chunk) => streamChunks.push(chunk),
  });

  const runtimeMs = performance.now() - runtimeStart;

  record(
    "1. User question accepted",
    response.responseContent.length > 0 && response.steps.some((step) => step.stage === "conversation" && step.status === "completed"),
    `intent=${response.intentKey}, correlationId=${response.correlationId}`,
    { userQuestion, intentKey: response.intentKey },
  );

  const retrievalStep = response.steps.find((step) => step.stage === "retrieval");
  record(
    "2. Retrieval execution",
    retrievalStep?.status === "completed",
    `retrieval=${retrievalStep?.status}, durationMs=${retrievalStep?.durationMs ?? 0}`,
    { retrievalStep },
  );

  const promptStep = response.steps.find((step) => step.stage === "prompt");
  record(
    "3. Prompt generation",
    promptStep?.status === "completed",
    `prompt=${promptStep?.status}, durationMs=${promptStep?.durationMs ?? 0}`,
    { promptStep },
  );

  record(
    "4. OpenAI response",
    response.providerKey === "openai" && /MFA policy/i.test(response.responseContent),
    `provider=${response.providerKey}, contentLength=${response.responseContent.length}`,
    { responsePreview: response.responseContent.slice(0, 160) },
  );

  record(
    "5. Streaming",
    streamChunks.length > 0,
    `chunks=${streamChunks.length}, streamedLength=${streamChunks.join("").length}`,
    { firstChunks: streamChunks.slice(0, 4) },
  );

  const { data: messages } = await client
    .from("conversation_messages")
    .select("id, message_type, content, metadata")
    .eq("conversation_id", DEMO_CONVERSATION_ID)
    .order("created_at", { ascending: false })
    .limit(5);

  const persistedOutgoing = messages?.find(
    (message) =>
      message.message_type === "outgoing" &&
      typeof message.metadata === "object" &&
      message.metadata !== null &&
      (message.metadata as Record<string, unknown>).correlationId === correlationId,
  );

  record(
    "6. Conversation persistence",
    Boolean(persistedOutgoing?.content),
    persistedOutgoing ? `messageId=${persistedOutgoing.id}` : "outgoing message not found",
    { persistedOutgoing },
  );

  const { data: analyticsRows } = await client
    .from("ai_execution_analytics")
    .select("id, provider_key, model, total_tokens, estimated_cost, execution_id, correlation_id")
    .eq("company_id", DEMO_BETA_COMPANY_ID)
    .eq("correlation_id", correlationId)
    .order("recorded_at", { ascending: false })
    .limit(3);

  const latestAnalytics = analyticsRows?.[0];
  record(
    "7. Observability",
    Boolean(latestAnalytics?.id),
    latestAnalytics
      ? `analyticsId=${latestAnalytics.id}, tokens=${latestAnalytics.total_tokens}`
      : "analytics record missing",
    { latestAnalytics, correlationId },
  );

  record(
    "8. Token accounting",
    response.tokenUsage.totalTokens > 0,
    `prompt=${response.tokenUsage.promptTokens}, completion=${response.tokenUsage.completionTokens}, total=${response.tokenUsage.totalTokens}`,
    { tokenUsage: response.tokenUsage },
  );

  const { data: costRows } = await client
    .from("ai_token_cost_records")
    .select("id, estimated_cost, currency, total_tokens, provider_key, execution_id")
    .eq("company_id", DEMO_BETA_COMPANY_ID)
    .eq("execution_id", latestAnalytics?.execution_id ?? "")
    .order("recorded_at", { ascending: false })
    .limit(3);

  const latestCost = costRows?.[0];
  record(
    "9. Cost accounting",
    Boolean(latestCost?.estimated_cost && latestCost.estimated_cost > 0),
    latestCost
      ? `cost=${latestCost.estimated_cost} ${latestCost.currency}, tokens=${latestCost.total_tokens}`
      : "cost record missing",
    { latestCost },
  );

  const passed = results.filter((result) => result.pass).length;
  const failed = results.filter((result) => !result.pass).length;
  console.log("---");
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`);

  const reportDir = resolve(root, "docs/architecture");
  mkdirSync(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, "increment-5-runtime-e2e-report.md");
  writeFileSync(
    reportPath,
    [
      "# Increment 5 — Enterprise AI Runtime E2E Verification Report",
      "",
      `**Generated:** ${new Date().toISOString()}`,
      `**Target:** ${config.url}`,
      "",
      "## Executive Summary",
      "",
      failed === 0
        ? "Increment 5 runtime pipeline verification passed. The Enterprise Runtime Coordinator orchestrates intent resolution, retrieval, prompt construction, OpenAI chat execution (with streaming), conversation persistence, and observability with token/cost accounting."
        : "Increment 5 runtime verification completed with failures — see scenario details below.",
      "",
      "## Architecture Decisions",
      "",
      "1. **Question-based retrieval** — Runtime passes `messageText` to Retrieval Orchestration; manual query vectors are deprecated but still supported for backward compatibility.",
      "2. **OpenAI chat adapter** — Real HTTP adapter registered in `AIProviderFactory` for `openai`; other providers remain stubbed.",
      "3. **Streaming via metadata** — `onChunk` callback flows through Execution Engine → Provider metadata without bypassing Runtime Coordinator.",
      "4. **Observability enrichment** — Runtime telemetry port records trace spans plus `ExecutionAnalyticsService` and cost accounting.",
      "",
      "## Modified Files",
      "",
      "- `lib/ai-provider-layer/src/providers/openai-chat-adapter.ts`",
      "- `lib/ai-execution-engine/src/services/ai-execution-service.ts`",
      "- `lib/runtime-integration/src/coordinator/enterprise-runtime-coordinator.ts`",
      "- `artifacts/login-app/src/lib/runtime-integration/engine-ports.ts`",
      "- `artifacts/login-app/src/lib/runtime-integration/observability-adapter.ts`",
      "- `scripts/runtime-e2e-verify.mts`",
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
        `- **Result:** ${result.pass ? "PASS" : "FAIL"}`,
        `- **Detail:** ${result.detail}`,
        result.evidence ? `- **Evidence:**\n\`\`\`json\n${JSON.stringify(result.evidence, null, 2)}\n\`\`\`` : "",
        "",
      ]),
      "## End-to-End Verification",
      "",
      `- User question: \`${userQuestion}\``,
      `- Provider: \`${response.providerKey}\``,
      `- Streaming chunks: ${streamChunks.length}`,
      `- Pipeline stages: ${response.steps.map((step) => `${step.stage}:${step.status}`).join(" → ")}`,
      "",
      "## Performance Observations",
      "",
      `- Full runtime execution: ~${runtimeMs.toFixed(2)} ms (mock OpenAI + pgvector)`,
      `- Retrieval stage: ${retrievalStep?.durationMs ?? 0} ms`,
      `- Prompt stage: ${promptStep?.durationMs ?? 0} ms`,
      "",
      "## Known Limitations",
      "",
      "1. E2E uses deterministic mock OpenAI fetch; live OpenAI requires `OPENAI_API_KEY`.",
      "2. Dashboard AI chat page remains a demo stub — runtime is consumed via coordinator services, not direct UI wiring.",
      "3. Non-OpenAI chat providers remain stub adapters until Increment 6+ provider expansion.",
      "4. Streaming token usage depends on provider including usage in the final SSE chunk (OpenAI may omit mid-stream).",
      "",
    ].join("\n"),
  );
  console.log(`Report written: ${reportPath}`);
  await client.rpc("_demo_set_triggers", { enabled: true });
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
