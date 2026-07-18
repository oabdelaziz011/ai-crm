/**
 * Embedding Platform end-to-end verification.
 * Run: npm run embedding:e2e (from artifacts/login-app)
 */
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createKnowledgePlatformServices } from "../lib/knowledge-platform/src/index.ts";
import {
  EmbeddingProviderFactory,
  createEmbeddingProviderAdapterRegistry,
  createOpenAIEmbeddingAdapter,
} from "../lib/embedding-platform/src/index.ts";
import {
  createSupabaseEmbeddingJobRepository,
  createSupabaseEmbeddingProviderConnectionRepository,
  createSupabaseEmbeddingProviderDefinitionRepository,
  createSupabaseKnowledgeChunkReader,
  createSupabaseKnowledgeEmbeddingRepository,
} from "../lib/embedding-platform/src/repositories/supabase-embedding-repositories.ts";
import { EmbeddingGenerationService, EmbeddingJobService } from "../lib/embedding-platform/src/services/embedding-generation-service.ts";
import { EmbeddingProviderRegistryService } from "../lib/embedding-platform/src/services/embedding-provider-registry-service.ts";
import { EmbeddingVersionService } from "../lib/embedding-platform/src/services/embedding-version-service.ts";
import type { ServiceContext } from "../lib/embedding-platform/src/types.ts";
import { InMemoryEmbeddingTelemetryPort } from "../lib/embedding-platform/src/ports/embedding-telemetry-port.ts";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSupabaseEnv, resolveSupabaseConfig } from "./lib/supabase-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const fixturesDir = resolve(root, "lib/knowledge-platform/src/test-fixtures");

const DEMO_PASSWORD = "DemoVault2026!";
const DEMO_BETA_COMPANY_ID = "d0000010-0001-4001-8001-000000000002";
const PLATFORM_OWNER = "demo-platform@vaultos.local";

type Result = { scenario: string; pass: boolean; detail: string; evidence?: Record<string, unknown> };
const results: Result[] = [];

function record(scenario: string, pass: boolean, detail: string, evidence?: Record<string, unknown>) {
  results.push({ scenario, pass, detail, evidence });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${scenario} — ${detail}`);
}

function createMockOpenAIFetch(mode: "success" | "retry" | "timeout") {
  let attempts = 0;
  return async (_url: string, init?: RequestInit) => {
    attempts += 1;
    if (mode === "timeout") {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }

    if (mode === "retry" && attempts < 2) {
      return { ok: false, status: 429, text: async () => "rate limited" } as Response;
    }

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
          embedding: Array.from({ length: 8 }, (_, dim) =>
            Number((((text?.length ?? 0) + index + dim + 1) / 100).toFixed(6)),
          ),
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

function createEmbeddingServices(client: SupabaseClient, fetchMode: "success" | "retry" | "timeout" = "success") {
  const telemetry = new InMemoryEmbeddingTelemetryPort();
  const definitionRepository = createSupabaseEmbeddingProviderDefinitionRepository(client);
  const connectionRepository = createSupabaseEmbeddingProviderConnectionRepository(client);
  const embeddingRepository = createSupabaseKnowledgeEmbeddingRepository(client);
  const jobRepository = createSupabaseEmbeddingJobRepository(client);
  const chunkReader = createSupabaseKnowledgeChunkReader(client);
  const useLiveOpenAI = Boolean(process.env.OPENAI_API_KEY) && fetchMode === "success" && process.env.EMBEDDING_E2E_LIVE === "true";

  const factory = useLiveOpenAI
    ? new EmbeddingProviderFactory(definitionRepository)
    : new EmbeddingProviderFactory(
        definitionRepository,
        createEmbeddingProviderAdapterRegistry({
          openai: (configuration) =>
            createOpenAIEmbeddingAdapter(
              {
                apiKey: "e2e-test-key",
                dimensions: 8,
                timeoutMs: fetchMode === "timeout" ? 50 : 5000,
                maxRetries: fetchMode === "retry" ? 2 : 0,
                ...configuration,
              },
              { fetchFn: createMockOpenAIFetch(fetchMode) },
            ),
          azure_openai: (configuration) =>
            createOpenAIEmbeddingAdapter({ apiKey: "e2e-test-key", dimensions: 8, ...configuration }, {
              fetchFn: createMockOpenAIFetch("success"),
            }),
          gemini: (configuration) =>
            createOpenAIEmbeddingAdapter({ apiKey: "e2e-test-key", dimensions: 8, ...configuration }, {
              fetchFn: createMockOpenAIFetch("success"),
            }),
          cohere: (configuration) =>
            createOpenAIEmbeddingAdapter({ apiKey: "e2e-test-key", dimensions: 8, ...configuration }, {
              fetchFn: createMockOpenAIFetch("success"),
            }),
          voyage: (configuration) =>
            createOpenAIEmbeddingAdapter({ apiKey: "e2e-test-key", dimensions: 8, ...configuration }, {
              fetchFn: createMockOpenAIFetch("success"),
            }),
          ollama: (configuration) =>
            createOpenAIEmbeddingAdapter({ apiKey: "e2e-test-key", dimensions: 8, ...configuration }, {
              fetchFn: createMockOpenAIFetch("success"),
            }),
        }),
      );

  const versions = new EmbeddingVersionService(embeddingRepository);
  const generation = new EmbeddingGenerationService(
    factory,
    connectionRepository,
    embeddingRepository,
    chunkReader,
    versions,
    telemetry,
  );
  const jobs = new EmbeddingJobService(jobRepository, connectionRepository, chunkReader, generation, versions);
  const registry = new EmbeddingProviderRegistryService(definitionRepository, connectionRepository, factory);

  return {
    registry,
    factory,
    generation,
    jobs,
    versions,
    telemetry,
    mode: useLiveOpenAI ? "live-openai" : `mock-${fetchMode}`,
  };
}

async function ensureConnection(client: SupabaseClient, services: ReturnType<typeof createEmbeddingServices>, ctx: ServiceContext) {
  const { data: existing } = await client
    .from("embedding_provider_connections")
    .select("id, display_name, is_enabled, configuration")
    .eq("company_id", DEMO_BETA_COMPANY_ID)
    .eq("display_name", "E2E OpenAI Embeddings")
    .is("deleted_at", null)
    .maybeSingle();

  if (existing?.id) {
    await client
      .from("embedding_provider_connections")
      .update({ is_enabled: true, configuration: { model: "text-embedding-3-small", dimensions: 8, apiKey: "e2e-test-key" } })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data: provider } = await client
    .from("embedding_provider_definitions")
    .select("id")
    .eq("key", "openai")
    .maybeSingle();
  if (!provider?.id) throw new Error("OpenAI embedding provider definition not found.");

  const connection = await services.registry.createConnection(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    providerId: provider.id,
    displayName: "E2E OpenAI Embeddings",
    configuration: { model: "text-embedding-3-small", dimensions: 8, apiKey: "e2e-test-key" },
    isEnabled: true,
    isDefault: true,
  });
  return connection.id;
}

async function importSampleDocument(ctx: ServiceContext, knowledge: ReturnType<typeof createKnowledgePlatformServices>) {
  const source = await knowledge.sources.createSource(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    key: `e2e_embed_${Date.now()}`,
    displayName: "E2E Embedding Source",
    sourceType: "pdf",
  });

  const pdfBase64 = readFileSync(resolve(fixturesDir, "sample.pdf"), "base64");
  const imported = await knowledge.import.importDocument(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    sourceId: source.id,
    title: "E2E Embedding Document",
    rawContent: pdfBase64,
    mimeType: "application/pdf",
    contentEncoding: "base64",
    fileName: "e2e-embedding.pdf",
  });

  return imported;
}

async function main() {
  const env = loadSupabaseEnv(root);
  const config = resolveSupabaseConfig(env, process.env);
  if (!config) {
    console.error("Missing Supabase credentials.");
    process.exit(2);
  }

  console.log("Embedding Platform E2E Verification");
  console.log(`Target: ${config.url}`);
  console.log("---");

  const { client, userId } = await signIn(config.url, config.key);
  const ctx = makeContext(userId);
  const knowledge = createKnowledgePlatformServices(client);
  const services = createEmbeddingServices(client, "success");
  console.log(`Provider mode: ${services.mode}`);

  const imported = await importSampleDocument(ctx, knowledge);
  const chunkIds = imported.chunks.map((chunk) => chunk.id);
  const connectionId = await ensureConnection(client, services, ctx);

  const jobs = await services.jobs.enqueueForVersion(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    versionId: imported.version.id,
    connectionId,
  });

  record(
    "1. Chunk → job enqueue",
    jobs.length === chunkIds.length && jobs.every((job) => job.status === "queued"),
    `jobs=${jobs.length}, chunks=${chunkIds.length}`,
    { jobIds: jobs.map((job) => job.id), chunkIds },
  );

  const completed = await services.jobs.processBatch(ctx, DEMO_BETA_COMPANY_ID, { limit: 8, batchSize: 8 });
  const { data: embeddings } = await client
    .from("knowledge_embeddings")
    .select("id, knowledge_chunk_id, provider, model, dimensions, status, is_active, vector, metadata")
    .in(
      "knowledge_chunk_id",
      chunkIds,
    );

  record(
    "2. Queue batch execution + persistence",
    completed.every((job) => job.status === "completed") && (embeddings?.length ?? 0) === chunkIds.length,
    `completed=${completed.length}, embeddings=${embeddings?.length ?? 0}`,
    {
      jobs: completed.map((job) => ({ id: job.id, status: job.status, result_embedding_id: job.result_embedding_id })),
      embeddings: (embeddings ?? []).map((row) => ({
        id: row.id,
        chunk_id: row.knowledge_chunk_id,
        status: row.status,
        is_active: row.is_active,
        dimensions: row.dimensions,
        vector_length: Array.isArray(row.vector) ? row.vector.length : 0,
        mock: (row.metadata as Record<string, unknown>)?.mock,
      })),
    },
  );

  const retryServices = createEmbeddingServices(client, "retry");
  const retryJob = await retryServices.jobs.enqueue(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    knowledgeChunkId: chunkIds[0]!,
    connectionId,
    regenerate: true,
  });
  const retryCompleted = await retryServices.jobs.processNext(ctx, DEMO_BETA_COMPANY_ID);
  record(
    "3. Provider retry behavior",
    retryCompleted?.status === "completed",
    `job=${retryCompleted?.id}, status=${retryCompleted?.status}`,
    { telemetry: retryServices.telemetry.events.filter((event) => event.operation === "generate") },
  );

  const timeoutServices = createEmbeddingServices(client, "timeout");
  const timeoutJob = await timeoutServices.jobs.enqueue(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    knowledgeChunkId: chunkIds[0]!,
    connectionId,
    regenerate: true,
  });
  const timeoutResult = await timeoutServices.jobs.processNext(ctx, DEMO_BETA_COMPANY_ID);
  record(
    "4. Timeout handling",
    timeoutResult?.status === "queued" || timeoutResult?.status === "failed",
    `status=${timeoutResult?.status}, error=${timeoutResult?.error_message ?? "n/a"}`,
    { errorMessage: timeoutResult?.error_message },
  );

  const recoveryServices = createEmbeddingServices(client, "success");
  const recovered = timeoutResult?.status === "queued"
    ? await recoveryServices.jobs.processNext(ctx, DEMO_BETA_COMPANY_ID)
    : await recoveryServices.jobs.retry(ctx, timeoutJob.id).then(() => recoveryServices.jobs.processNext(ctx, DEMO_BETA_COMPANY_ID));

  record(
    "5. Failure recovery",
    recovered?.status === "completed",
    `status=${recovered?.status}`,
    { recoveredJobId: recovered?.id, resultEmbeddingId: recovered?.result_embedding_id },
  );

  record(
    "6. Execution metrics (telemetry port)",
    services.telemetry.events.some((event) => event.operation === "generate_batch" && event.status === "succeeded"),
    `events=${services.telemetry.events.length}`,
    { events: services.telemetry.events },
  );

  const passed = results.filter((result) => result.pass).length;
  const failed = results.filter((result) => !result.pass).length;
  console.log("---");
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`);

  const reportDir = resolve(root, "docs/architecture");
  mkdirSync(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, "embedding-platform-e2e-report.md");
  writeFileSync(
    reportPath,
    [
      "# Embedding Platform E2E Verification Report",
      "",
      `**Generated:** ${new Date().toISOString()}`,
      `**Target:** ${config.url}`,
      `**Provider mode:** ${services.mode}`,
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
      "## Known Limitations",
      "",
      "1. Automatic embedding enqueue after knowledge import is not wired yet — jobs are enqueued explicitly via `enqueueForVersion`.",
      "2. Non-OpenAI embedding adapters remain stubs until future increments.",
      "3. Vector search, pgvector indexing, and retrieval orchestration are out of scope for Increment 2.",
      "4. Live OpenAI verification requires `OPENAI_API_KEY` and `EMBEDDING_E2E_LIVE=true`; default E2E uses deterministic mock fetch.",
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
