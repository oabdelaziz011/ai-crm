/**
 * Sprint A1-05 acceptance validation: embedding worker pipeline.
 * Run: pnpm --dir lib/embedding-platform exec node --import tsx/esm ../../scripts/knowledge-embedding-worker-validation.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createEmbeddingPlatformServices } from "../lib/embedding-platform/src/index.ts";
import { createKnowledgePlatformServices } from "../lib/knowledge-platform/src/index.ts";
import { createVectorStoreServices } from "../lib/vector-store/src/index.ts";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { loadRuntimeEnv } from "./lib/runtime-env.mjs";

const root = resolve("C:/Users/oabde/Downloads/project");

function resolveServiceRoleKey(env: Record<string, string>) {
  if (env.SUPABASE_SERVICE_ROLE_KEY) return env.SUPABASE_SERVICE_ROLE_KEY;
  const out = execSync("supabase projects api-keys --project-ref lfbtnskmvibikalsxwsm -o json", {
    encoding: "utf8",
    cwd: root,
  });
  return JSON.parse(out).find((entry: { name: string }) => entry.name === "service_role")?.api_key as string;
}

const checks: { id: string; ok: boolean; detail: string }[] = [];

function record(id: string, ok: boolean, detail: string) {
  checks.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id}: ${detail}`);
}

function makeContext(companyId: string) {
  return {
    userId: null,
    companyId,
    isSuperAdmin: true,
    hasPermission: () => true,
  };
}

async function ensureDefaultEmbeddingConnection(
  client: ReturnType<typeof createClient>,
  embedding: ReturnType<typeof createEmbeddingPlatformServices>,
  ctx: ReturnType<typeof makeContext>,
  companyId: string,
) {
  const existing = await embedding.registry.listConnections(ctx, { companyId, isEnabled: true });
  if (existing.length > 0) return existing[0]!;

  const { data: provider } = await client
    .from("embedding_provider_definitions")
    .select("id")
    .eq("key", "openai")
    .maybeSingle();
  if (!provider?.id) throw new Error("OpenAI embedding provider definition missing.");

  return embedding.registry.createConnection(ctx, {
    companyId,
    providerId: provider.id as string,
    displayName: "A1-05 Validation Embedding",
    configuration: { model: "text-embedding-3-small", dimensions: 1536 },
    isDefault: true,
    isEnabled: true,
    status: "active",
  });
}

async function countJobsByDocument(
  client: ReturnType<typeof createClient>,
  companyId: string,
  documentId: string,
  versionId: string,
  status?: string,
) {
  let query = client
    .from("embedding_jobs")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("metadata->>documentId", documentId)
    .eq("metadata->>versionId", versionId);
  if (status) query = query.eq("status", status);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function countChunksForVersion(client: ReturnType<typeof createClient>, versionId: string) {
  const { count, error } = await client
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true })
    .eq("version_id", versionId)
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

async function createQueuedDocument(
  services: ReturnType<typeof createKnowledgePlatformServices>,
  ctx: ReturnType<typeof makeContext>,
  companyId: string,
  title: string,
) {
  const source = await services.sources.createSource(ctx, {
    companyId,
    key: `a105-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    displayName: "A1-05 Worker Source",
    sourceType: "policy",
  });
  const imported = await services.import.importDocument(ctx, {
    companyId,
    sourceId: source.id,
    title,
    rawContent:
      "Enterprise MFA policy requires multi-factor authentication for all users accessing sensitive systems.",
    mimeType: "text/plain",
    contentEncoding: "text",
  });
  return services.publishing.publishDocument(ctx, imported.document.id);
}

async function main() {
  const env = loadRuntimeEnv(root);
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = resolveServiceRoleKey(env);
  if (!url || !serviceRoleKey) throw new Error("Supabase credentials required.");

  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const vectorStore = createVectorStoreServices(client);
  const embedding = createEmbeddingPlatformServices(client, { vectorStore });
  const services = createKnowledgePlatformServices(client, { embeddingQueue: embedding.queue });
  if (!embedding.worker) throw new Error("Embedding worker orchestrator unavailable.");

  const { data: company, error: companyError } = await client
    .from("companies")
    .select("id")
    .eq("company_type", "tenant")
    .limit(1)
    .maybeSingle();
  if (companyError || !company?.id) throw companyError ?? new Error("No tenant company found.");
  const companyId = company.id as string;
  const ctx = makeContext(companyId);

  await ensureDefaultEmbeddingConnection(client, embedding, ctx, companyId);

  const published = await createQueuedDocument(services, ctx, companyId, `A1-05 Worker ${Date.now()}`);
  const workerResult = await embedding.worker.processCompanyQueue(ctx, companyId, {
    workerId: "a105-validation-worker",
    limit: 16,
    batchSize: 16,
    drain: true,
  });

  const completedJobs = await countJobsByDocument(
    client,
    companyId,
    published.document.id,
    published.version.id,
    "completed",
  );
  const chunkCount = await countChunksForVersion(client, published.version.id);
  record(
    "scenario1.worker_completed_jobs",
    workerResult.jobs.every((job) => job.status === "completed") &&
      completedJobs === chunkCount &&
      chunkCount > 0,
    JSON.stringify({ completedJobs, chunkCount, processedJobs: workerResult.jobs.length }),
  );

  const { data: documentAfter } = await client
    .from("knowledge_documents")
    .select("status, metadata")
    .eq("id", published.document.id)
    .maybeSingle();
  const publishing = (documentAfter?.metadata as { publishing?: { embedding_status?: string } })?.publishing;
  record(
    "scenario7.document_indexed",
    documentAfter?.status === "indexed" && publishing?.embedding_status === "completed",
    JSON.stringify({ status: documentAfter?.status, embedding_status: publishing?.embedding_status }),
  );

  const { count: indexedVectorCount } = await client
    .from("indexed_vectors")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "indexed")
    .in(
      "knowledge_embedding_id",
      workerResult.jobs
        .map((job) => job.result_embedding_id)
        .filter((value): value is string => Boolean(value)),
    );
  const { count: pgvectorCount } = await client
    .from("pgvector_store_vectors")
    .select("vector_id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .in(
      "vector_id",
      workerResult.jobs
        .map((job) => job.result_embedding_id)
        .filter((value): value is string => Boolean(value)),
    );
  record(
    "scenario8.vector_validation",
    (indexedVectorCount ?? 0) === completedJobs && (pgvectorCount ?? 0) === completedJobs,
    JSON.stringify({ indexedVectorCount, pgvectorCount, completedJobs }),
  );

  const republished = await services.publishing.publishDocument(ctx, published.document.id);
  const queuedAfterRepublish = await countJobsByDocument(
    client,
    companyId,
    published.document.id,
    published.version.id,
    "queued",
  );
  record(
    "scenario2.no_duplicate_jobs_on_republish",
    republished.idempotent && queuedAfterRepublish === 0,
    `queued=${queuedAfterRepublish} idempotent=${republished.idempotent}`,
  );

  const concurrentPublished = await createQueuedDocument(
    services,
    ctx,
    companyId,
    `A1-05 Concurrent ${Date.now()}`,
  );
  const queuedBeforeConcurrent = await countJobsByDocument(
    client,
    companyId,
    concurrentPublished.document.id,
    concurrentPublished.version.id,
    "queued",
  );
  const [workerA, workerB] = await Promise.all([
    embedding.worker.processCompanyQueue(ctx, companyId, {
      workerId: "a105-worker-a",
      limit: 8,
      batchSize: 8,
      drain: false,
    }),
    embedding.worker.processCompanyQueue(ctx, companyId, {
      workerId: "a105-worker-b",
      limit: 8,
      batchSize: 8,
      drain: false,
    }),
  ]);
  const overlap = new Set(workerA.jobs.map((job) => job.id));
  const duplicateIds = workerB.jobs.filter((job) => overlap.has(job.id)).map((job) => job.id);
  record(
    "scenario5.concurrent_workers",
    queuedBeforeConcurrent > 0 && duplicateIds.length === 0,
    `queued=${queuedBeforeConcurrent} workerA=${workerA.jobs.length} workerB=${workerB.jobs.length} overlap=${duplicateIds.length}`,
  );

  await embedding.worker.processCompanyQueue(ctx, companyId, {
    workerId: "a105-concurrent-drain",
    limit: 32,
    batchSize: 16,
    drain: true,
  });

  const source = await services.sources.createSource(ctx, {
    companyId,
    key: `a105-large-${Date.now()}`,
    displayName: "A1-05 Large Source",
    sourceType: "manual",
  });
  const importedLarge = await services.import.importDocument(ctx, {
    companyId,
    sourceId: source.id,
    title: `A1-05 Large ${Date.now()}`,
    rawContent: "Seed content for large worker validation.",
    mimeType: "text/plain",
    contentEncoding: "text",
  });
  const largeVersion = (await services.versions.listVersions(ctx, {
    companyId,
    documentId: importedLarge.document.id,
  }))[0]!;
  const sectionContent = "Large enterprise policy chunk content for worker validation. ".repeat(8);
  for (let index = 0; index < 520; index += 1) {
    await services.sections.createSection(ctx, {
      companyId,
      documentId: importedLarge.document.id,
      versionId: largeVersion.id,
      title: `Section ${index + 1}`,
      content: `${sectionContent} Section ${index + 1}`,
      sectionOrder: index,
    });
  }
  await services.chunks.generateChunksForVersion(ctx, importedLarge.document.id, largeVersion.id);
  const largePublished = await services.publishing.publishDocument(ctx, importedLarge.document.id);
  const largeWorker = await embedding.worker.processCompanyQueue(ctx, companyId, {
    workerId: "a105-large-worker",
    limit: 32,
    batchSize: 16,
    drain: true,
  });
  const largeCompleted = await countJobsByDocument(
    client,
    companyId,
    largePublished.document.id,
    largePublished.version.id,
    "completed",
  );
  const largeChunks = await countChunksForVersion(client, largePublished.version.id);
  record(
    "scenario5.large_document",
    largeCompleted === largeChunks && largeChunks >= 500,
    `chunks=${largeChunks} completed=${largeCompleted} processed=${largeWorker.jobs.length}`,
  );

  const passed = checks.filter((check) => check.ok).length;
  console.log(`\nSUMMARY: ${passed}/${checks.length} PASS`);
  if (passed < checks.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
