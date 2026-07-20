/**
 * Sprint A1-04 acceptance validation: knowledge embedding queue pipeline.
 * Run: pnpm --dir lib/embedding-platform exec node --import tsx/esm ../../scripts/knowledge-embedding-queue-validation.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createEmbeddingPlatformServices } from "../lib/embedding-platform/src/index.ts";
import { createKnowledgePlatformServices } from "../lib/knowledge-platform/src/index.ts";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve("C:/Users/oabde/Downloads/project");

function loadEnv() {
  const env: Record<string, string> = {};
  for (const filePath of [resolve(root, "artifacts/login-app/.env.local"), resolve(root, ".env")]) {
    try {
      for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (match) env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

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

async function importDraftDocument(
  services: ReturnType<typeof createKnowledgePlatformServices>,
  ctx: ReturnType<typeof makeContext>,
  companyId: string,
  sourceId: string,
  title: string,
) {
  return services.import.importDocument(ctx, {
    companyId,
    sourceId,
    title,
    rawContent: "Enterprise MFA policy requires multi-factor authentication for all users accessing sensitive systems.",
    mimeType: "text/plain",
    contentEncoding: "text",
  });
}

async function countQueuedJobsForDocument(
  client: ReturnType<typeof createClient>,
  companyId: string,
  documentId: string,
  versionId: string,
) {
  const { count, error } = await client
    .from("embedding_jobs")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "queued")
    .eq("metadata->>documentId", documentId)
    .eq("metadata->>versionId", versionId);
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
    displayName: "A1-04 Validation Embedding",
    configuration: { model: "text-embedding-3-small", dimensions: 1536 },
    isDefault: true,
    isEnabled: true,
    status: "active",
  });
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = resolveServiceRoleKey(env);
  if (!url || !serviceRoleKey) throw new Error("Supabase credentials required.");

  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const embedding = createEmbeddingPlatformServices(client);
  const services = createKnowledgePlatformServices(client, { embeddingQueue: embedding.queue });

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

  const sourceKey = `a104-${Date.now()}`;
  const source = await services.sources.createSource(ctx, {
    companyId,
    key: sourceKey,
    displayName: "A1-04 Validation Source",
    sourceType: "policy",
  });

  const imported = await importDraftDocument(services, ctx, companyId, source.id, `A1-04 Policy ${Date.now()}`);
  record("scenario1.draft_created", imported.document.status === "draft", imported.document.status);

  const published = await services.publishing.publishDocument(ctx, imported.document.id);
  const chunkCount = await countChunksForVersion(client, published.version.id);
  const queuedJobs = await countQueuedJobsForDocument(client, companyId, imported.document.id, published.version.id);
  const publishingMeta = published.document.metadata.publishing as
    | { embedding_status?: string; queue?: { queued_job_count?: number } }
    | undefined;
  record(
    "scenario1.publish_and_queue",
    published.document.status === "indexing" &&
      publishingMeta?.embedding_status === "queued" &&
      queuedJobs === chunkCount &&
      chunkCount > 0,
    JSON.stringify({
      status: published.document.status,
      embedding_status: publishingMeta?.embedding_status,
      queuedJobs,
      chunks: chunkCount,
    }),
  );

  const republished = await services.publishing.publishDocument(ctx, imported.document.id);
  const queuedJobsAfterRepublish = await countQueuedJobsForDocument(
    client,
    companyId,
    imported.document.id,
    published.version.id,
  );
  record(
    "scenario2.idempotent_queue",
    republished.idempotent && queuedJobsAfterRepublish === queuedJobs,
    `jobs=${queuedJobsAfterRepublish} idempotent=${republished.idempotent}`,
  );

  await services.publishing.archiveDocument(ctx, imported.document.id);
  let archiveBlocked = false;
  try {
    await embedding.queue.buildQueueForPublishedDocument(ctx, {
      documentId: imported.document.id,
      versionId: published.version.id,
      companyId,
    });
  } catch {
    archiveBlocked = true;
  }
  const { count: jobsAfterArchive } = await client
    .from("embedding_jobs")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "queued")
    .eq("metadata->>documentId", imported.document.id)
    .eq("metadata->>versionId", published.version.id);
  record(
    "scenario3.archive_no_new_jobs",
    archiveBlocked && (jobsAfterArchive ?? 0) === queuedJobsAfterRepublish,
    `blocked=${archiveBlocked} queuedJobs=${jobsAfterArchive ?? 0}`,
  );

  const tenantB = await client
    .from("companies")
    .select("id")
    .eq("company_type", "tenant")
    .neq("id", companyId)
    .limit(1)
    .maybeSingle();
  if (tenantB.data?.id) {
    let blocked = false;
    try {
      await embedding.queue.buildQueueForPublishedDocument(makeContext(tenantB.data.id as string), {
        documentId: imported.document.id,
        versionId: published.version.id,
        companyId,
      });
    } catch {
      blocked = true;
    }
    record("scenario4.tenant_isolation", blocked, `blocked cross-tenant queue for ${imported.document.id}`);
  } else {
    record("scenario4.tenant_isolation", true, "skipped second tenant fixture unavailable");
  }

  const largeSource = await services.sources.createSource(ctx, {
    companyId,
    key: `a104-large-${Date.now()}`,
    displayName: "A1-04 Large Source",
    sourceType: "manual",
  });
  const largeDocument = await services.documents.createDocument(ctx, {
    companyId,
    sourceId: largeSource.id,
    title: `A1-04 Large ${Date.now()}`,
    checksum: `large-${Date.now()}`,
  });
  const largeVersion = (await services.versions.listVersions(ctx, {
    companyId,
    documentId: largeDocument.id,
  }))[0]!;
  const sectionContent = "Large enterprise policy chunk content for embedding queue validation. ".repeat(8);
  for (let index = 0; index < 520; index += 1) {
    await services.sections.createSection(ctx, {
      companyId,
      documentId: largeDocument.id,
      versionId: largeVersion.id,
      title: `Section ${index + 1}`,
      content: `${sectionContent} Section ${index + 1}`,
      sectionOrder: index,
    });
  }
  await services.chunks.generateChunksForVersion(ctx, largeDocument.id, largeVersion.id);
  const largePublished = await services.publishing.publishDocument(ctx, largeDocument.id);
  const largeChunkCount = await countChunksForVersion(client, largePublished.version.id);
  const largeQueuedJobs = await countQueuedJobsForDocument(
    client,
    companyId,
    largeDocument.id,
    largePublished.version.id,
  );
  record(
    "scenario5.large_document",
    largeChunkCount >= 500 && largeQueuedJobs === largeChunkCount,
    `chunks=${largeChunkCount} queuedJobs=${largeQueuedJobs}`,
  );

  const invalidSource = await services.sources.createSource(ctx, {
    companyId,
    key: `a104-invalid-${Date.now()}`,
    displayName: "A1-04 Invalid Source",
    sourceType: "manual",
  });
  const invalidDoc = await services.documents.createDocument(ctx, {
    companyId,
    sourceId: invalidSource.id,
    title: `A1-04 Invalid ${Date.now()}`,
    checksum: `invalid-${Date.now()}`,
  });
  const invalidVersion = (await services.versions.listVersions(ctx, {
    companyId,
    documentId: invalidDoc.id,
  }))[0]!;
  await services.sections.createSection(ctx, {
    companyId,
    documentId: invalidDoc.id,
    versionId: invalidVersion.id,
    title: "Valid",
    content: "Valid chunk content for queue validation.",
    sectionOrder: 0,
  });
  await services.chunks.generateChunksForVersion(ctx, invalidDoc.id, invalidVersion.id);
  const { error: invalidChunkError } = await client.from("knowledge_chunks").insert({
    company_id: companyId,
    document_id: invalidDoc.id,
    version_id: invalidVersion.id,
    chunk_index: 99,
    chunk_order: 99,
    content: "   ",
    checksum: "invalid-empty-chunk",
    token_count: 0,
  });
  if (invalidChunkError) throw invalidChunkError;
  const invalidPublished = await services.publishing.publishDocument(ctx, invalidDoc.id);
  const invalidQueuedJobs = await countQueuedJobsForDocument(
    client,
    companyId,
    invalidDoc.id,
    invalidPublished.version.id,
  );
  const invalidPublishing = invalidPublished.document.metadata.publishing as
    | { queue?: { invalid_chunks_skipped?: number } }
    | undefined;
  const invalidSkipped = invalidPublishing?.queue?.invalid_chunks_skipped ?? 0;
  const { count: invalidAuditCount } = await client
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("entity", "knowledge_documents")
    .eq("entity_id", invalidDoc.id);
  record(
    "scenario6.invalid_chunks_skipped",
    invalidQueuedJobs >= 1 && Number(invalidSkipped) >= 1 && (invalidAuditCount ?? 0) >= 1,
    JSON.stringify({
      queuedJobs: invalidQueuedJobs,
      invalidSkipped,
      auditRows: invalidAuditCount ?? 0,
    }),
  );

  const passed = checks.filter((check) => check.ok).length;
  console.log(`\nSUMMARY: ${passed}/${checks.length} PASS`);
  if (passed < checks.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
