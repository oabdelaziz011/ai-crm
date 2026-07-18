/**
 * Retrieval Engine end-to-end verification.
 * Run: npm run retrieval:e2e (from artifacts/login-app)
 */
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
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
import type { ServiceContext } from "../lib/retrieval-engine/src/types.ts";
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
const PLATFORM_OWNER = "demo-platform@vaultos.local";

const FIXTURE_CONTENT =
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
  return async (_url: string, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body ?? "{}")) as { input?: string | string[] };
    const inputs = Array.isArray(payload.input) ? payload.input : [payload.input ?? ""];
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({
        model: "text-embedding-3-small",
        data: inputs.map((text, index) => ({
          index,
          embedding: mockEmbeddingFromText(text ?? ""),
        })),
        usage: { total_tokens: 16 },
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

function makeContext(userId: string): ServiceContext {
  return {
    userId,
    companyId: DEMO_BETA_COMPANY_ID,
    isSuperAdmin: true,
    hasPermission: () => true,
  };
}

async function ensureEmbeddingConnection(client: SupabaseClient, ctx: ServiceContext) {
  const definitionRepo = createSupabaseEmbeddingProviderDefinitionRepository(client);
  const connectionRepo = createSupabaseEmbeddingProviderConnectionRepository(client);
  const factory = new EmbeddingProviderFactory(
    definitionRepo,
    createEmbeddingProviderAdapterRegistry({
      openai: (configuration) => createOpenAIEmbeddingAdapter(configuration, { fetchFn: createMockOpenAIFetch() }),
    }),
  );
  const registry = new EmbeddingProviderRegistryService(definitionRepo, connectionRepo, factory);

  const connections = await registry.listConnections(ctx, { companyId: DEMO_BETA_COMPANY_ID });
  const existing = connections.find((item) => item.embedding_provider_definition?.key === "openai" && item.is_enabled);
  if (existing) return { connectionId: existing.id, registry, factory };

  const provider = await definitionRepo.findByKey("openai");
  if (!provider) throw new Error("OpenAI embedding provider definition not found.");

  const created = await registry.createConnection(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    providerId: provider.id,
    displayName: "E2E OpenAI Embeddings",
    configuration: { model: "text-embedding-3-small", apiKey: "e2e-mock-key" },
    isEnabled: true,
  });

  return { connectionId: created.id, registry, factory };
}

async function ensureRetrievalPolicy(client: SupabaseClient) {
  const { data: existing } = await client
    .from("retrieval_policies")
    .select("id")
    .eq("company_id", DEMO_BETA_COMPANY_ID)
    .eq("is_default", true)
    .maybeSingle();

  if (existing) {
    await client
      .from("retrieval_policies")
      .update({ max_context_tokens: 120, max_chunks: 2 })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data, error } = await client
    .from("retrieval_policies")
    .insert({
      company_id: DEMO_BETA_COMPANY_ID,
      policy_name: "e2e-retrieval",
      max_context_tokens: 120,
      max_chunks: 2,
      window_expansion: 0,
      min_source_diversity: 1,
      overlap_removal_threshold: 0.85,
      default_language: "en",
      is_default: true,
      metadata: {},
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function ensureIndexedFixture(
  client: SupabaseClient,
  ctx: ServiceContext,
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
    key: `e2e-retrieval-${Date.now()}`,
    display_name: "E2E Retrieval Source",
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

  await client
    .from("knowledge_documents")
    .update({ published_version_id: versionId })
    .eq("id", documentId);

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
    metadata: { source: "e2e-retrieval" },
  });

  const collectionName = `e2e-retrieval-${Date.now()}`;
  const collection = await vectorStore.management.provisionCollection(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    connectionId: vectorConnectionId,
    name: collectionName,
    embeddingVersion: 1,
    dimensions,
    metadata: { source: "e2e-retrieval" },
  });

  const indexed = await vectorStore.management.indexEmbedding(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    collectionId: collection.id,
    knowledgeEmbeddingId: embeddingId,
  });

  return { collection, indexed, chunkId, embeddingId, vector };
}

async function ensurePgvectorConnection(client: SupabaseClient, ctx: ServiceContext, vectorStore: ReturnType<typeof createVectorStoreServices>) {
  const { data: provider } = await client.from("vector_store_definitions").select("id, key").eq("key", "pgvector").maybeSingle();
  if (!provider) throw new Error("pgvector provider definition not found.");

  const existing = await vectorStore.registry.listConnections(ctx, { companyId: DEMO_BETA_COMPANY_ID });
  const match = existing.find((item) => item.vector_store_definition?.key === "pgvector" && item.is_enabled);
  if (match) return match.id;

  const created = await vectorStore.registry.createConnection(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    providerId: provider.id,
    displayName: "E2E PGVector Retrieval",
    configuration: { schema: "public", tablePrefix: "vs_" },
    isEnabled: true,
  });

  return (await vectorStore.registry.activateConnection(ctx, created.id)).id;
}

function createQueryEmbeddingPort(deps: {
  registry: EmbeddingProviderRegistryService;
  factory: EmbeddingProviderFactory;
}) {
  return {
    async generateQueryEmbedding(ctx: ServiceContext, input: { companyId: string; connectionId: string; text: string; model?: string }) {
      const connection = await deps.registry.getConnection(ctx as never, input.connectionId);
      const providerKey = connection.embedding_provider_definition?.key;
      if (!providerKey) throw new Error("Missing embedding provider.");
      const model =
        input.model ??
        (typeof connection.configuration.model === "string" ? connection.configuration.model : null) ??
        connection.embedding_provider_definition?.default_model;
      const provider = await deps.factory.resolve({
        providerKey,
        configuration: { ...connection.configuration, companyId: connection.company_id },
      });
      const result = await provider.generateEmbedding({ text: input.text, model: model ?? undefined });
      return {
        vector: result.vector,
        dimensions: result.dimensions,
        providerKey: result.providerKey,
        model: result.model,
        mock: result.mock,
      };
    },
  };
}

function createVectorQueryExecutionPort(deps: { management: ReturnType<typeof createVectorQueryServices>["management"] }) {
  return {
    async executeVectorQuery(ctx: ServiceContext, input: Record<string, unknown>) {
      const response = await deps.management.executeQuery(ctx as never, input as never);
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
  };
}

async function ensureVectorSearchPolicy(client: SupabaseClient) {
  const { data: existing } = await client
    .from("vector_search_policies")
    .select("id")
    .eq("company_id", DEMO_BETA_COMPANY_ID)
    .eq("is_default", true)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data, error } = await client
    .from("vector_search_policies")
    .insert({
      company_id: DEMO_BETA_COMPANY_ID,
      policy_name: "e2e-retrieval-search",
      default_top_k: 5,
      minimum_similarity_score: 0,
      maximum_results: 20,
      is_default: true,
      metadata: {},
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function main() {
  const env = loadSupabaseEnv(root);
  const config = resolveSupabaseConfig(env);
  if (!config) throw new Error("Supabase config not found.");

  const { client, userId } = await signIn(config.url, config.key);
  const ctx = makeContext(userId);

  const vectorStore = createVectorStoreServices(client);
  const vectorQuery = createVectorQueryServices(client);
  const embeddingSetup = await ensureEmbeddingConnection(client, ctx);
  const vectorConnectionId = await ensurePgvectorConnection(client, ctx, vectorStore);
  await ensureRetrievalPolicy(client);
  await ensureVectorSearchPolicy(client);

  const queryEmbeddingPort = createQueryEmbeddingPort(embeddingSetup);
  const vectorQueryPort = createVectorQueryExecutionPort({ management: vectorQuery.management });

  const retrieval = createRetrievalServices(client, {
    queryEmbeddingPort,
    vectorQueryPort,
  });

  const fixture = await ensureIndexedFixture(
    client,
    ctx,
    vectorStore,
    vectorConnectionId,
    embeddingSetup.connectionId,
  );

  const queryTextForEmbedding = FIXTURE_CONTENT;

  const embeddingStart = performance.now();
  const queryEmbedding = await queryEmbeddingPort.generateQueryEmbedding(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    connectionId: embeddingSetup.connectionId,
    text: queryTextForEmbedding,
  });
  const embeddingMs = performance.now() - embeddingStart;

  record(
    "1. Question → Query Embedding",
    queryEmbedding.dimensions === 8 && queryEmbedding.vector.length === 8,
    `provider=${queryEmbedding.providerKey}, dimensions=${queryEmbedding.dimensions}, latencyMs=${embeddingMs.toFixed(2)}`,
    { model: queryEmbedding.model, vectorPreview: queryEmbedding.vector.slice(0, 4) },
  );

  const searchStart = performance.now();
  const vectorQueryResult = await vectorQueryPort.executeVectorQuery(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    connectionId: vectorConnectionId,
    collectionId: fixture.collection.id,
    queryVector: queryEmbedding.vector,
    topK: 5,
    minimumScore: 0,
    correlationId: `e2e-retrieval-${randomUUID()}`,
  });
  const searchMs = performance.now() - searchStart;

  record(
    "2. Query Embedding → Semantic Search",
    vectorQueryResult.resultCount > 0,
    `results=${vectorQueryResult.resultCount}, provider=${vectorQueryResult.provider}, latencyMs=${searchMs.toFixed(2)}`,
    { executionId: vectorQueryResult.executionId },
  );

  const retrievalStart = performance.now();
  const response = await retrieval.orchestration.retrieveFromQuestion(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    question: queryTextForEmbedding,
    embeddingConnectionId: embeddingSetup.connectionId,
    vectorStoreConnectionId: vectorConnectionId,
    collectionId: fixture.collection.id,
    topK: 5,
    minimumScore: 0.01,
    maxTokenBudget: 120,
    correlationId: `e2e-retrieval-full-${randomUUID()}`,
  });
  const retrievalMs = performance.now() - retrievalStart;

  record(
    "3. Candidate Retrieval",
    response.context.chunks.length > 0,
    `chunks=${response.context.chunks.length}, vectorQueryExecutionId=${response.vectorQueryExecutionId}`,
    { chunkIds: response.context.chunks.map((chunk) => chunk.knowledgeChunkId) },
  );

  const ranks = response.context.chunks.map((chunk) => chunk.selectionRank);
  const sortedRanks = [...ranks].sort((left, right) => left - right);
  record(
    "4. Ranking",
    ranks.length > 0 && ranks.every((rank, index) => rank === sortedRanks[index]) && ranks[0] === 1,
    `ranks=${ranks.join(",")}`,
    { scores: response.context.chunks.map((chunk) => chunk.normalizedScore) },
  );

  const thresholdResponse = await retrieval.orchestration.retrieveFromQuestion(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    question: queryTextForEmbedding,
    embeddingConnectionId: embeddingSetup.connectionId,
    vectorStoreConnectionId: vectorConnectionId,
    collectionId: fixture.collection.id,
    minimumScore: 0.99,
    topK: 5,
    correlationId: `e2e-threshold-${randomUUID()}`,
  });

  record(
    "5. Threshold filtering",
    thresholdResponse.context.chunkCount <= response.context.chunkCount,
    `strictChunks=${thresholdResponse.context.chunkCount}, baselineChunks=${response.context.chunkCount}`,
  );

  record(
    "6. Token budgeting",
    response.metrics.budgetUsedTokens <= 120 && response.metrics.budgetTokens <= 120,
    `used=${response.metrics.budgetUsedTokens}, budget=${response.metrics.budgetTokens}, discarded=${response.metrics.chunksDiscardedBudget}`,
    { metrics: response.metrics },
  );

  const hasContent = response.context.chunks.every((chunk) => chunk.content.trim().length > 0);
  const hasReferences = response.context.chunks.every(
    (chunk) => chunk.references.documentId && chunk.references.sourceId,
  );

  record(
    "7. Context assembly",
    hasContent && hasReferences && response.context.totalTokens > 0,
    `totalTokens=${response.context.totalTokens}, executionId=${response.executionId}, orchestrationMs=${response.orchestrationTimeMs}`,
    {
      chunks: response.context.chunks.map((chunk) => ({
        rank: chunk.selectionRank,
        tokenCount: chunk.tokenCount,
        title: chunk.metadata.documentTitle,
        contentPreview: chunk.content.slice(0, 80),
      })),
    },
  );

  const passed = results.filter((result) => result.pass).length;
  const failed = results.filter((result) => !result.pass).length;
  console.log("---");
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`);

  const reportDir = resolve(root, "docs/architecture");
  mkdirSync(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, "retrieval-engine-e2e-report.md");
  writeFileSync(
    reportPath,
    [
      "# Retrieval Engine E2E Verification Report",
      "",
      `**Generated:** ${new Date().toISOString()}`,
      `**Target:** ${config.url}`,
      "",
      "## Summary",
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
      "## Performance Observations",
      "",
      `- Query embedding generation: ~${embeddingMs.toFixed(2)} ms (mock OpenAI)`,
      `- Semantic search execution: ~${searchMs.toFixed(2)} ms`,
      `- Full orchestration pipeline: ~${retrievalMs.toFixed(2)} ms`,
      "",
      "## Known Limitations",
      "",
      "1. E2E uses deterministic mock OpenAI fetch for query embeddings; live OpenAI requires `OPENAI_API_KEY`.",
      "2. Runtime Coordinator and Prompt Orchestrator are not exercised in this increment scope.",
      "3. Threshold scenario depends on vector-query minimum score policy — low-similarity hits may already be excluded upstream.",
      "",
    ].join("\n"),
  );
  console.log(`Report written: ${reportPath}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
