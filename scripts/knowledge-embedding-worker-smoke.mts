/**
 * Sprint A1-05 smoke validation (scenarios 1, 7, 8 without large-doc stress).
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createEmbeddingPlatformServices } from "../lib/embedding-platform/src/index.ts";
import { createKnowledgePlatformServices } from "../lib/knowledge-platform/src/index.ts";
import { createVectorStoreServices } from "../lib/vector-store/src/index.ts";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { loadRuntimeEnv } from "./lib/runtime-env.mjs";

const root = resolve("C:/Users/oabde/Downloads/project");
const env = loadRuntimeEnv(root);
function resolveServiceRoleKey() {
  if (env.SUPABASE_SERVICE_ROLE_KEY) return env.SUPABASE_SERVICE_ROLE_KEY;
  const out = execSync("supabase projects api-keys --project-ref lfbtnskmvibikalsxwsm -o json", {
    encoding: "utf8",
    cwd: root,
  });
  return JSON.parse(out).find((entry: { name: string }) => entry.name === "service_role")?.api_key as string;
}

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceRoleKey = resolveServiceRoleKey();
if (!url || !serviceRoleKey) throw new Error("Supabase credentials required.");

const client = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
const ctx = { userId: null, companyId: null as string | null, isSuperAdmin: true, hasPermission: () => true };
const vectorStore = createVectorStoreServices(client);
const embedding = createEmbeddingPlatformServices(client, { vectorStore });
const services = createKnowledgePlatformServices(client, { embeddingQueue: embedding.queue });
const { data: company } = await client.from("companies").select("id").eq("company_type", "tenant").limit(1).single();
if (!company?.id || !embedding.worker) throw new Error("Setup failed");
ctx.companyId = company.id;
const companyId = company.id;

const source = await services.sources.createSource(ctx, {
  companyId,
  key: `a105-smoke-${Date.now()}`,
  displayName: "Smoke",
  sourceType: "policy",
});
const imported = await services.import.importDocument(ctx, {
  companyId,
  sourceId: source.id,
  title: `Smoke ${Date.now()}`,
  rawContent: "Enterprise MFA policy requires multi-factor authentication.",
  mimeType: "text/plain",
  contentEncoding: "text",
});
const published = await services.publishing.publishDocument(ctx, imported.document.id);
const workerResult = await embedding.worker.processCompanyQueue(ctx, companyId, {
  workerId: "smoke-worker",
  limit: 16,
  batchSize: 16,
  drain: true,
});
const { data: doc } = await client
  .from("knowledge_documents")
  .select("status, metadata")
  .eq("id", published.document.id)
  .single();
const embeddingIds = workerResult.jobs.map((job) => job.result_embedding_id).filter(Boolean);
const { count: indexedCount } = await client
  .from("indexed_vectors")
  .select("id", { count: "exact", head: true })
  .eq("company_id", companyId)
  .in("knowledge_embedding_id", embeddingIds as string[]);
console.log(
  JSON.stringify(
    {
      jobsCompleted: workerResult.jobs.filter((job) => job.status === "completed").length,
      documentStatus: doc?.status,
      embeddingStatus: (doc?.metadata as { publishing?: { embedding_status?: string } })?.publishing?.embedding_status,
      indexedVectors: indexedCount,
    },
    null,
    2,
  ),
);
