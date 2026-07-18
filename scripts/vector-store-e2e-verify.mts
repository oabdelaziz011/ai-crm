/**
 * Vector Store Platform (pgvector) end-to-end verification.
 * Run: npm run vector-store:e2e (from artifacts/login-app)
 */
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createVectorStoreServices } from "../lib/vector-store/src/index.ts";
import { createVectorQueryServices } from "../lib/vector-query/src/index.ts";
import type { ServiceContext } from "../lib/vector-store/src/types.ts";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { loadSupabaseEnv, resolveSupabaseConfig } from "./lib/supabase-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const DEMO_PASSWORD = "DemoVault2026!";
const DEMO_BETA_COMPANY_ID = "d0000010-0001-4001-8001-000000000002";
const PLATFORM_OWNER = "demo-platform@vaultos.local";

type Result = { scenario: string; pass: boolean; detail: string; evidence?: Record<string, unknown> };
const results: Result[] = [];

function record(scenario: string, pass: boolean, detail: string, evidence?: Record<string, unknown>) {
  results.push({ scenario, pass, detail, evidence });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${scenario} — ${detail}`);
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

async function ensurePgvectorConnection(client: SupabaseClient, ctx: ServiceContext, services: ReturnType<typeof createVectorStoreServices>) {
  const { data: provider } = await client
    .from("vector_store_definitions")
    .select("id, key")
    .eq("key", "pgvector")
    .maybeSingle();

  if (!provider) {
    throw new Error("pgvector provider definition not found in vector_store_definitions.");
  }

  const existing = await services.registry.listConnections(ctx, { companyId: DEMO_BETA_COMPANY_ID });
  const match = existing.find((item) => item.vector_store_definition?.key === "pgvector" && item.is_enabled);
  if (match) return match.id;

  const created = await services.registry.createConnection(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    providerId: provider.id,
    displayName: "E2E PGVector",
    configuration: { schema: "public", tablePrefix: "vs_" },
    isEnabled: true,
  });

  return (await services.registry.activateConnection(ctx, created.id)).id;
}

async function ensureSearchPolicy(client: SupabaseClient) {
  const { data: existing } = await client
    .from("vector_search_policies")
    .select("id")
    .eq("company_id", DEMO_BETA_COMPANY_ID)
    .eq("is_default", true)
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await client
    .from("vector_search_policies")
    .insert({
      company_id: DEMO_BETA_COMPANY_ID,
      policy_name: "e2e-default",
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

async function ensureKnowledgeEmbedding(client: SupabaseClient, dimensions: number) {
  const { data: existing } = await client
    .from("knowledge_embeddings")
    .select("id, knowledge_chunk_id, vector, dimensions, status, is_active, embedding_version")
    .eq("company_id", DEMO_BETA_COMPANY_ID)
    .eq("status", "active")
    .eq("is_active", true)
    .eq("dimensions", dimensions)
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const vector = Array.from({ length: dimensions }, (_, index) => Number(((index + 1) / 100).toFixed(6)));
  const chunkId = randomUUID();
  const { error: chunkError } = await client.from("knowledge_chunks").insert({
    id: chunkId,
    company_id: DEMO_BETA_COMPANY_ID,
    content: "Vector store E2E fixture chunk",
    content_hash: randomUUID().replace(/-/g, ""),
    token_count: 12,
    metadata: { source: "e2e-vector-store" },
    is_active: true,
    status: "active",
  });
  if (chunkError) throw chunkError;

  const embeddingId = randomUUID();
  const { data, error } = await client
    .from("knowledge_embeddings")
    .insert({
      id: embeddingId,
      company_id: DEMO_BETA_COMPANY_ID,
      knowledge_chunk_id: chunkId,
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions,
      embedding_version: 1,
      vector,
      checksum: randomUUID().replace(/-/g, ""),
      status: "active",
      is_active: true,
      metadata: { source: "e2e-vector-store" },
    })
    .select("id, knowledge_chunk_id, vector, dimensions, status, is_active, embedding_version")
    .single();

  if (error) throw error;
  return data;
}

async function main() {
  const env = loadSupabaseEnv(root);
  const config = resolveSupabaseConfig(env);
  if (!config) {
    throw new Error("Supabase config not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }
  const { client, userId } = await signIn(config.url, config.key);
  const ctx = makeContext(userId);

  const vectorStore = createVectorStoreServices(client);
  const vectorQuery = createVectorQueryServices(client);

  const migrationProbe = await client.from("pgvector_store_collections").select("id").limit(1);
  record(
    "0. pgvector migration available",
    !migrationProbe.error,
    migrationProbe.error?.message ?? "pgvector_store_collections is reachable",
  );
  if (migrationProbe.error) {
    throw new Error("Migration 106_pgvector_storage.sql must be applied before running vector store E2E.");
  }

  const connectionId = await ensurePgvectorConnection(client, ctx, vectorStore);
  await ensureSearchPolicy(client);

  const dimensions = 8;
  const embedding = await ensureKnowledgeEmbedding(client, dimensions);
  const collectionName = `e2e-pgvector-${Date.now()}`;

  const collection = await vectorStore.management.provisionCollection(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    connectionId,
    name: collectionName,
    embeddingVersion: embedding.embedding_version ?? 1,
    dimensions,
    metadata: { source: "e2e-vector-store" },
  });

  record(
    "1. Collection provisioning",
    Boolean(collection.id) && collection.is_active,
    `collection=${collection.id}, provider=${collection.provider}`,
    { collectionId: collection.id, collectionName: collection.name },
  );

  const indexed = await vectorStore.management.indexEmbedding(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    collectionId: collection.id,
    knowledgeEmbeddingId: embedding.id,
  });

  const { data: physicalVector } = await client
    .from("pgvector_store_vectors")
    .select("id, vector_id, dimensions, metadata")
    .eq("company_id", DEMO_BETA_COMPANY_ID)
    .eq("collection_name", collectionName)
    .eq("vector_id", embedding.id)
    .maybeSingle();

  record(
    "2. Vector persistence (pgvector upsert)",
    indexed.status === "indexed" && Boolean(physicalVector?.id),
    `indexed=${indexed.status}, physicalRow=${physicalVector?.id ?? "missing"}`,
    {
      indexedVectorId: indexed.id,
      externalReference: indexed.external_reference,
      physicalVector,
    },
  );

  const statsStart = performance.now();
  const provider = await vectorStore.factory.resolve({
    providerKey: "pgvector",
    configuration: { schema: "public", tablePrefix: "vs_", companyId: DEMO_BETA_COMPANY_ID },
  });
  const stats = await provider.collectionStatistics({ collectionName });
  const statsMs = performance.now() - statsStart;

  record(
    "3. Collection statistics",
    stats.vectorCount === 1 && stats.dimensions === dimensions && stats.mock === false,
    `vectorCount=${stats.vectorCount}, dimensions=${stats.dimensions}, latencyMs=${statsMs.toFixed(2)}`,
    { stats, statsMs },
  );

  const queryStart = performance.now();
  const queryOutcome = await vectorQuery.management.executeQuery(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    connectionId,
    collectionId: collection.id,
    queryVector: embedding.vector as number[],
    correlationId: `e2e-${randomUUID()}`,
  });
  const queryMs = performance.now() - queryStart;

  record(
    "4. Cosine similarity nearest-neighbor query",
    queryOutcome.resultCount > 0 && queryOutcome.normalizedResults[0]?.ranking === 1,
    `results=${queryOutcome.resultCount}, latencyMs=${queryMs.toFixed(2)}`,
    {
      executionId: queryOutcome.executionId,
      topHit: queryOutcome.normalizedResults[0],
      queryMs,
    },
  );

  const filteredOutcome = await vectorQuery.management.executeQuery(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    connectionId,
    collectionId: collection.id,
    queryVector: embedding.vector as number[],
    metadataFilters: { document_type: "policy" },
    correlationId: `e2e-filter-${randomUUID()}`,
  });

  record(
    "5. Metadata filtering",
    filteredOutcome.resultCount === 0,
    `filteredResults=${filteredOutcome.resultCount}`,
    { executionId: filteredOutcome.executionId },
  );

  const removed = await vectorStore.management.removeVector(ctx, {
    companyId: DEMO_BETA_COMPANY_ID,
    indexedVectorId: indexed.id,
  });

  const { data: afterDelete } = await client
    .from("pgvector_store_vectors")
    .select("id")
    .eq("company_id", DEMO_BETA_COMPANY_ID)
    .eq("collection_name", collectionName)
    .eq("vector_id", embedding.id)
    .maybeSingle();

  let collectionTeardown = "skipped";
  try {
    await vectorStore.management.decommissionCollection(ctx, collection.id);
    collectionTeardown = "management-service";
  } catch {
    const { error: rpcError } = await client.rpc("pgvector_delete_collection", {
      p_company_id: DEMO_BETA_COMPANY_ID,
      p_collection_name: collectionName,
    });
    collectionTeardown = rpcError ? `failed:${rpcError.message}` : "pgvector-rpc";
  }

  record(
    "6. Vector delete + collection teardown",
    removed.status === "removed" && !afterDelete,
    `removedStatus=${removed.status}, physicalRowAfterDelete=${afterDelete?.id ?? "none"}, teardown=${collectionTeardown}`,
    { indexedVectorId: indexed.id, collectionTeardown },
  );

  const passed = results.filter((result) => result.pass).length;
  const failed = results.filter((result) => !result.pass).length;
  console.log("---");
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`);

  const reportDir = resolve(root, "docs/architecture");
  mkdirSync(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, "vector-store-e2e-report.md");
  writeFileSync(
    reportPath,
    [
      "# Vector Store Platform E2E Verification Report",
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
      `- Collection statistics RPC: ~${statsMs.toFixed(2)} ms`,
      `- Similarity query pipeline: ~${queryMs.toFixed(2)} ms (includes registry + normalization + persistence)`,
      "",
      "## Known Limitations",
      "",
      "1. HNSW index builds asynchronously on large imports; small E2E datasets use exact ordering via `<=>` operator.",
      "2. Metadata filtering uses JSONB containment (`@>`) — partial text or range filters are not supported yet.",
      "3. Non-pgvector vector store providers remain stubs.",
      "4. Retrieval Engine orchestration is out of scope for Increment 3.",
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
