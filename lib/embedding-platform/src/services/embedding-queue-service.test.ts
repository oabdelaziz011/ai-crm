import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnowledgeDocumentRecord, KnowledgeDocumentRepository } from "@workspace/knowledge-platform";
import type {
  EmbeddingJobRepository,
  EmbeddingProviderConnectionRepository,
  KnowledgeChunkReader,
} from "../repositories/embedding-repositories.js";
import type {
  EmbeddingJobRecord,
  EmbeddingProviderConnectionRecord,
  KnowledgeChunkSnapshot,
  ServiceContext,
} from "../types.js";
import { EmbeddingQueueService } from "./embedding-queue-service.js";
import { EmbeddingVersionService } from "./embedding-version-service.js";
import type { KnowledgeEmbeddingRepository } from "../repositories/embedding-repositories.js";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      ["knowledge.publish", "embeddings.view", "embeddings.manage", "embeddings.generate"].includes(code),
    ...overrides,
  };
}

function createMockSupabase(): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { status: "Active", subscription_status: "active" },
            error: null,
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

function createQueueEnvironment(options?: { chunkCount?: number; invalidChunkIds?: Set<string> }) {
  const chunkCount = options?.chunkCount ?? 2;
  const invalidChunkIds = options?.invalidChunkIds ?? new Set<string>();
  const chunks: KnowledgeChunkSnapshot[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    const id = `chunk-${index + 1}`;
    chunks.push({
      id,
      company_id: "company-1",
      content: invalidChunkIds.has(id) ? "   " : `Chunk content ${index + 1}`,
      checksum: invalidChunkIds.has(id) ? "" : `checksum-${index + 1}`,
    });
  }

  let document: KnowledgeDocumentRecord = {
    id: "doc-1",
    company_id: "company-1",
    source_id: "source-1",
    title: "Policy",
    description: null,
    status: "published",
    mime_type: "text/plain",
    checksum: "doc-checksum",
    current_version_number: 1,
    published_version_id: "version-1",
    metadata: { publishing: { embedding_status: "pending", retrieval_available: true } },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: "user-1",
    deleted_at: null,
    deleted_by: null,
  };

  const connections: EmbeddingProviderConnectionRecord[] = [
    {
      id: "connection-1",
      company_id: "company-1",
      provider_id: "provider-def-1",
      display_name: "Default",
      status: "active",
      configuration: { model: "text-embedding-3-small" },
      is_default: true,
      is_enabled: true,
      health_status: "connected",
      last_health_check: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by: null,
      embedding_provider_definition: {
        id: "provider-def-1",
        key: "openai",
        display_name: "OpenAI",
        description: "",
        icon: null,
        default_model: "text-embedding-3-small",
        default_dimensions: 1536,
        configuration_schema: {},
        default_configuration: {},
        is_active: true,
        version: "1.0.0",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    },
  ];

  const jobs: EmbeddingJobRecord[] = [];
  const embeddings: never[] = [];

  const documentRepository: KnowledgeDocumentRepository = {
    findById: async (id) => (id === document.id ? document : null),
    create: async () => {
      throw new Error("not implemented");
    },
    update: async (input) => {
      document = {
        ...document,
        ...(input.status ? { status: input.status } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
        updated_at: new Date().toISOString(),
      };
      return document;
    },
    list: async () => [document],
    softDelete: async () => document,
  };

  const jobRepository: EmbeddingJobRepository = {
    create: async (input) => {
      const record: EmbeddingJobRecord = {
        id: `job-${jobs.length + 1}`,
        company_id: input.companyId,
        knowledge_chunk_id: input.knowledgeChunkId,
        connection_id: input.connectionId,
        provider: input.provider,
        model: input.model,
        embedding_version: input.embeddingVersion,
        status: "queued",
        retry_count: 0,
        max_retries: input.maxRetries ?? 3,
        error_message: null,
        result_embedding_id: null,
        metadata: input.metadata ?? {},
        queued_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        cancelled_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: input.createdBy ?? null,
      };
      jobs.push(record);
      return record;
    },
    createMany: async (inputs) => {
      const created: EmbeddingJobRecord[] = [];
      for (const input of inputs) {
        created.push(await jobRepository.create(input));
      }
      return created;
    },
    findById: async (id) => jobs.find((item) => item.id === id) ?? null,
    list: async (filter) => jobs.filter((item) => item.company_id === filter.companyId),
    listByChunkIds: async (filter) =>
      jobs.filter(
        (item) =>
          item.company_id === filter.companyId &&
          filter.chunkIds.includes(item.knowledge_chunk_id) &&
          (!filter.statuses?.length || filter.statuses.includes(item.status)),
      ),
    update: async (input) => {
      const record = jobs.find((item) => item.id === input.jobId)!;
      Object.assign(record, {
        status: input.status ?? record.status,
      });
      return record;
    },
    claimNextQueued: async () => null,
    claimNextQueuedBatch: async () => [],
  };

  const connectionRepository: EmbeddingProviderConnectionRepository = {
    create: async () => connections[0]!,
    findById: async (id) => connections.find((item) => item.id === id) ?? null,
    list: async (filter) =>
      connections.filter((item) => item.company_id === filter.companyId && item.is_enabled),
    update: async () => connections[0]!,
    softDelete: async () => connections[0]!,
  };

  const chunkReader: KnowledgeChunkReader = {
    findById: async (chunkId) => chunks.find((item) => item.id === chunkId) ?? null,
    listByVersion: async (companyId, versionId) =>
      versionId === "version-1" ? chunks.filter((item) => item.company_id === companyId) : [],
  };

  const embeddingRepository: KnowledgeEmbeddingRepository = {
    create: async () => {
      throw new Error("not implemented");
    },
    findById: async () => null,
    list: async () => [],
    update: async () => {
      throw new Error("not implemented");
    },
    findActive: async () => null,
    getLatestVersion: async () => 0,
    deactivateActive: async () => {},
  };

  const versionService = new EmbeddingVersionService(embeddingRepository);
  const queueService = new EmbeddingQueueService(
    createMockSupabase(),
    documentRepository,
    jobRepository,
    connectionRepository,
    chunkReader,
    versionService,
  );

  return { queueService, jobs, documentRepository, getDocument: () => document };
}

describe("EmbeddingQueueService", () => {
  it("creates queued jobs for published documents", async () => {
    const env = createQueueEnvironment();
    const result = await env.queueService.buildQueueForPublishedDocument(createContext(), {
      documentId: "doc-1",
      versionId: "version-1",
      companyId: "company-1",
    });

    assert.equal(result.jobsCreated, 2);
    assert.equal(result.queuedJobCount, 2);
    assert.equal(result.document.status, "indexing");
    assert.equal(result.document.metadata.publishing?.embedding_status, "queued");
    assert.equal(env.jobs.length, 2);
  });

  it("is idempotent when queue builder runs again", async () => {
    const env = createQueueEnvironment();
    await env.queueService.buildQueueForPublishedDocument(createContext(), {
      documentId: "doc-1",
      versionId: "version-1",
      companyId: "company-1",
    });
    const second = await env.queueService.buildQueueForPublishedDocument(createContext(), {
      documentId: "doc-1",
      versionId: "version-1",
      companyId: "company-1",
    });

    assert.equal(second.idempotent, true);
    assert.equal(second.jobsCreated, 0);
    assert.equal(env.jobs.length, 2);
  });

  it("rejects archived documents", async () => {
    const env = createQueueEnvironment();
    const document = env.getDocument();
    document.status = "archived";

    await assert.rejects(
      env.queueService.buildQueueForPublishedDocument(createContext(), {
        documentId: "doc-1",
        versionId: "version-1",
        companyId: "company-1",
      }),
      /not eligible/,
    );
  });

  it("skips invalid chunks safely", async () => {
    const env = createQueueEnvironment({ chunkCount: 3, invalidChunkIds: new Set(["chunk-2"]) });
    const result = await env.queueService.buildQueueForPublishedDocument(createContext(), {
      documentId: "doc-1",
      versionId: "version-1",
      companyId: "company-1",
    });

    assert.equal(result.invalidChunksSkipped, 1);
    assert.equal(result.jobsCreated, 2);
    assert.equal(env.jobs.length, 2);
  });

  it("supports large documents with batch inserts", async () => {
    const env = createQueueEnvironment({ chunkCount: 520 });
    const result = await env.queueService.buildQueueForPublishedDocument(createContext(), {
      documentId: "doc-1",
      versionId: "version-1",
      companyId: "company-1",
    });

    assert.equal(result.jobsCreated, 520);
    assert.equal(env.jobs.length, 520);
  });

  it("enforces tenant isolation", async () => {
    const env = createQueueEnvironment();
    await assert.rejects(
      env.queueService.buildQueueForPublishedDocument(createContext({ companyId: "company-2" }), {
        documentId: "doc-1",
        versionId: "version-1",
        companyId: "company-1",
      }),
      /embeddings\.view|Permission denied/i,
    );
  });
});
