import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EmbeddingProviderFactory } from "../factory/embedding-provider-factory.js";
import {
  EmbeddingChecksumMismatchError,
  EmbeddingJobStateError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import { createOpenAIEmbeddingAdapter } from "../providers/openai-embedding-adapter.js";
import { createEmbeddingProviderAdapterRegistry } from "../providers/provider-contract.js";
import { createStubEmbeddingAdapterClass } from "../providers/stub-adapter-base.js";
import { InMemoryEmbeddingTelemetryPort } from "../ports/embedding-telemetry-port.js";
import type {
  EmbeddingJobRepository,
  EmbeddingProviderConnectionRepository,
  EmbeddingProviderDefinitionRepository,
  KnowledgeChunkReader,
  KnowledgeEmbeddingRepository,
} from "../repositories/embedding-repositories.js";
import { EmbeddingGenerationService, EmbeddingJobService } from "./embedding-generation-service.js";
import { EmbeddingProviderRegistryService } from "./embedding-provider-registry-service.js";
import { EmbeddingVersionService } from "./embedding-version-service.js";
import type {
  EmbeddingJobRecord,
  EmbeddingProviderConnectionRecord,
  EmbeddingProviderDefinitionRecord,
  KnowledgeEmbeddingRecord,
  ServiceContext,
} from "../types.js";
import { computeChecksum, computeEmbeddingChecksum } from "../utils/embedding-utils.js";

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
          embedding: text.split("").slice(0, 4).map((char, charIndex) => Number(((char.charCodeAt(0) + charIndex) / 100).toFixed(6))),
        })),
        usage: { total_tokens: 12 },
      }),
    } as Response;
  };
}

function createTestAdapterRegistry() {
  const StubGemini = createStubEmbeddingAdapterClass({
    key: "gemini",
    displayName: "Gemini Embeddings",
    defaultModel: "text-embedding-004",
    defaultDimensions: 4,
    configurationSchema: {
      type: "object",
      properties: { model: { type: "string" }, dimensions: { type: "number" } },
      required: ["model"],
    },
  });

  return createEmbeddingProviderAdapterRegistry({
    openai: (configuration) =>
      createOpenAIEmbeddingAdapter(
        { apiKey: "test-key", dimensions: 4, ...configuration },
        { fetchFn: createMockOpenAIFetch() },
      ),
    azure_openai: (configuration) => new StubGemini(configuration),
    gemini: (configuration) => new StubGemini(configuration),
    cohere: (configuration) => new StubGemini(configuration),
    voyage: (configuration) => new StubGemini(configuration),
    ollama: (configuration) => new StubGemini(configuration),
  });
}

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      ["embeddings.view", "embeddings.manage", "embeddings.generate"].includes(code),
    ...overrides,
  };
}

function createEnvironment() {
  const definitions: EmbeddingProviderDefinitionRecord[] = [
    {
      id: "provider-def-1",
      key: "openai",
      display_name: "OpenAI Embeddings",
      description: "",
      icon: null,
      default_model: "text-embedding-3-small",
      default_dimensions: 4,
      configuration_schema: {
        type: "object",
        properties: { model: { type: "string" }, dimensions: { type: "number" } },
        required: ["model"],
      },
      default_configuration: { model: "text-embedding-3-small", dimensions: 4 },
      is_active: true,
      version: "1.0.0",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const connections: EmbeddingProviderConnectionRecord[] = [];
  const embeddings: KnowledgeEmbeddingRecord[] = [];
  const jobs: EmbeddingJobRecord[] = [];
  const chunks = new Map([
    [
      "chunk-1",
      {
        id: "chunk-1",
        company_id: "company-1",
        content: "Enterprise knowledge chunk content.",
        checksum: computeChecksum("Enterprise knowledge chunk content."),
      },
    ],
    [
      "chunk-2",
      {
        id: "chunk-2",
        company_id: "company-2",
        content: "Other company chunk.",
        checksum: computeChecksum("Other company chunk."),
      },
    ],
  ]);

  const definitionRepository: EmbeddingProviderDefinitionRepository = {
    listActive: async () => definitions.filter((item) => item.is_active),
    listAll: async () => definitions,
    findById: async (id) => definitions.find((item) => item.id === id) ?? null,
    findByKey: async (key) => definitions.find((item) => item.key === key) ?? null,
  };

  const connectionRepository: EmbeddingProviderConnectionRepository = {
    create: async (input) => {
      const record: EmbeddingProviderConnectionRecord = {
        id: `connection-${connections.length + 1}`,
        company_id: input.companyId,
        provider_id: input.providerId,
        display_name: input.displayName,
        status: input.status ?? "active",
        configuration: input.configuration ?? {},
        is_default: input.isDefault ?? false,
        is_enabled: input.isEnabled ?? true,
        health_status: input.healthStatus ?? "connected",
        last_health_check: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
        embedding_provider_definition: definitions.find((item) => item.id === input.providerId) ?? null,
      };
      connections.push(record);
      return record;
    },
    findById: async (id) => connections.find((item) => item.id === id && !item.deleted_at) ?? null,
    list: async (filter) =>
      connections.filter((item) => item.company_id === filter.companyId && !item.deleted_at),
    update: async (input) => {
      const record = connections.find((item) => item.id === input.connectionId)!;
      Object.assign(record, {
        display_name: input.displayName ?? record.display_name,
        configuration: input.configuration ?? record.configuration,
        is_enabled: input.isEnabled ?? record.is_enabled,
      });
      return record;
    },
    softDelete: async (connectionId) => {
      const record = connections.find((item) => item.id === connectionId)!;
      record.deleted_at = new Date().toISOString();
      return record;
    },
  };

  const embeddingRepository: KnowledgeEmbeddingRepository = {
    create: async (input) => {
      const record: KnowledgeEmbeddingRecord = {
        id: `embedding-${embeddings.length + 1}`,
        company_id: input.companyId,
        knowledge_chunk_id: input.knowledgeChunkId,
        connection_id: input.connectionId,
        provider: input.provider,
        model: input.model,
        dimensions: input.dimensions,
        embedding_version: input.embeddingVersion,
        vector: input.vector,
        checksum: input.checksum,
        status: input.status ?? "pending",
        is_active: input.isActive ?? false,
        metadata: input.metadata ?? {},
        activated_at: null,
        superseded_at: null,
        created_at: new Date().toISOString(),
        created_by: input.createdBy ?? null,
      };
      embeddings.push(record);
      return record;
    },
    findById: async (id) => embeddings.find((item) => item.id === id) ?? null,
    list: async (filter) =>
      embeddings.filter((item) => {
        if (item.company_id !== filter.companyId) return false;
        if (filter.knowledgeChunkId && item.knowledge_chunk_id !== filter.knowledgeChunkId) return false;
        if (filter.isActive !== undefined && item.is_active !== filter.isActive) return false;
        return true;
      }),
    update: async (input) => {
      const record = embeddings.find((item) => item.id === input.embeddingId)!;
      Object.assign(record, {
        status: input.status ?? record.status,
        is_active: input.isActive ?? record.is_active,
        activated_at: input.activatedAt ?? record.activated_at,
        superseded_at: input.supersededAt ?? record.superseded_at,
      });
      return record;
    },
    findActive: async (knowledgeChunkId, provider, model) =>
      embeddings.find(
        (item) =>
          item.knowledge_chunk_id === knowledgeChunkId &&
          item.provider === provider &&
          item.model === model &&
          item.is_active &&
          item.status === "active",
      ) ?? null,
    getLatestVersion: async (knowledgeChunkId, provider, model) => {
      const versions = embeddings
        .filter(
          (item) =>
            item.knowledge_chunk_id === knowledgeChunkId &&
            item.provider === provider &&
            item.model === model,
        )
        .map((item) => item.embedding_version);
      return versions.length ? Math.max(...versions) : 0;
    },
    deactivateActive: async (knowledgeChunkId, provider, model) => {
      for (const item of embeddings) {
        if (
          item.knowledge_chunk_id === knowledgeChunkId &&
          item.provider === provider &&
          item.model === model &&
          item.is_active
        ) {
          item.is_active = false;
          item.status = "superseded";
          item.superseded_at = new Date().toISOString();
        }
      }
    },
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
    findById: async (id) => jobs.find((item) => item.id === id) ?? null,
    list: async (filter) => jobs.filter((item) => item.company_id === filter.companyId),
    update: async (input) => {
      const record = jobs.find((item) => item.id === input.jobId)!;
      Object.assign(record, {
        status: input.status ?? record.status,
        retry_count: input.retryCount ?? record.retry_count,
        error_message: input.errorMessage ?? record.error_message,
        result_embedding_id: input.resultEmbeddingId ?? record.result_embedding_id,
        started_at: input.startedAt ?? record.started_at,
        completed_at: input.completedAt ?? record.completed_at,
        cancelled_at: input.cancelledAt ?? record.cancelled_at,
      });
      return record;
    },
    claimNextQueued: async (companyId) => {
      const queued = jobs.filter((item) => item.company_id === companyId && item.status === "queued").slice(0, 1);
      for (const job of queued) {
        job.status = "running";
        job.started_at = new Date().toISOString();
      }
      return queued[0] ?? null;
    },
    claimNextQueuedBatch: async (companyId, limit) => {
      const queued = jobs.filter((item) => item.company_id === companyId && item.status === "queued").slice(0, limit);
      for (const job of queued) {
        job.status = "running";
        job.started_at = new Date().toISOString();
      }
      return queued;
    },
  };

  const chunkReader: KnowledgeChunkReader = {
    findById: async (chunkId) => chunks.get(chunkId) ?? null,
    listByVersion: async (companyId, versionId) => {
      if (versionId !== "version-1") return [];
      return [...chunks.values()].filter((chunk) => chunk.company_id === companyId);
    },
  };

  const telemetry = new InMemoryEmbeddingTelemetryPort();
  const factory = new EmbeddingProviderFactory(definitionRepository, createTestAdapterRegistry());
  const versionService = new EmbeddingVersionService(embeddingRepository);
  const generationService = new EmbeddingGenerationService(
    factory,
    connectionRepository,
    embeddingRepository,
    chunkReader,
    versionService,
    telemetry,
  );
  const jobService = new EmbeddingJobService(
    jobRepository,
    connectionRepository,
    chunkReader,
    generationService,
    versionService,
  );
  const registryService = new EmbeddingProviderRegistryService(
    definitionRepository,
    connectionRepository,
    factory,
  );

  return {
    definitions,
    connections,
    embeddings,
    jobs,
    chunks,
    factory,
    versionService,
    generationService,
    jobService,
    registryService,
    embeddingRepository,
    jobRepository,
    telemetry,
  };
}

describe("EmbeddingProviderRegistryService", () => {
  it("lists provider types and supported adapters", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const types = await env.registryService.listProviderTypes(ctx);
    assert.equal(types.length, 1);
    assert.equal(types[0]?.key, "openai");

    const keys = await env.registryService.getSupportedAdapterKeys(ctx);
    assert.ok(keys.includes("openai"));
  });

  it("creates connections with validated configuration", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary OpenAI Embeddings",
      configuration: { model: "text-embedding-3-small", dimensions: 4 },
      isEnabled: true,
    });

    assert.equal(connection.display_name, "Primary OpenAI Embeddings");
    assert.equal(connection.configuration.model, "text-embedding-3-small");
  });
});

describe("Embedding job pipeline", () => {
  it("queues, processes, and stores active embeddings", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary",
      configuration: { model: "text-embedding-3-small", dimensions: 4 },
      isEnabled: true,
    });

    const queued = await env.jobService.enqueue(ctx, {
      companyId: "company-1",
      knowledgeChunkId: "chunk-1",
      connectionId: connection.id,
    });
    assert.equal(queued.status, "queued");
    assert.equal(queued.embedding_version, 1);

    const completed = await env.jobService.processNext(ctx, "company-1");
    assert.equal(completed?.status, "completed");
    assert.ok(completed?.result_embedding_id);

    const active = await env.versionService.getActiveEmbedding(
      ctx,
      "company-1",
      "chunk-1",
      "openai",
      "text-embedding-3-small",
    );
    assert.ok(active);
    assert.equal(active?.embedding_version, 1);
    assert.equal(active?.vector.length, 4);
    assert.equal(active?.metadata.mock, false);
  });

  it("supports retry after failure", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary",
      configuration: { model: "text-embedding-3-small", dimensions: 4 },
      isEnabled: true,
    });

    const job = await env.jobService.enqueue(ctx, {
      companyId: "company-1",
      knowledgeChunkId: "chunk-1",
      connectionId: connection.id,
    });

    const stored = env.jobs.find((item) => item.id === job.id)!;
    stored.status = "failed";
    stored.retry_count = 1;

    const retried = await env.jobService.retry(ctx, job.id);
    assert.equal(retried.status, "queued");
    assert.equal(retried.retry_count, 2);
  });

  it("cancels queued jobs", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary",
      configuration: { model: "text-embedding-3-small", dimensions: 4 },
      isEnabled: true,
    });

    const job = await env.jobService.enqueue(ctx, {
      companyId: "company-1",
      knowledgeChunkId: "chunk-1",
      connectionId: connection.id,
    });

    const cancelled = await env.jobService.cancel(ctx, job.id);
    assert.equal(cancelled.status, "cancelled");
  });
});

describe("EmbeddingVersionService", () => {
  it("regenerates embeddings with incremented versions", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary",
      configuration: { model: "text-embedding-3-small", dimensions: 4 },
      isEnabled: true,
    });

    await env.jobService.enqueue(ctx, {
      companyId: "company-1",
      knowledgeChunkId: "chunk-1",
      connectionId: connection.id,
    });
    await env.jobService.processNext(ctx, "company-1");

    const regenerated = await env.jobService.enqueue(ctx, {
      companyId: "company-1",
      knowledgeChunkId: "chunk-1",
      connectionId: connection.id,
      regenerate: true,
    });
    assert.equal(regenerated.embedding_version, 2);

    await env.jobService.processNext(ctx, "company-1");

    const versions = await env.versionService.listVersions(ctx, {
      companyId: "company-1",
      knowledgeChunkId: "chunk-1",
    });
    assert.equal(versions.length, 2);
    assert.equal(versions.filter((item) => item.is_active).length, 1);
    assert.equal(versions.find((item) => item.is_active)?.embedding_version, 2);
  });

  it("validates checksum before activation", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const bad = await env.embeddingRepository.create({
      companyId: "company-1",
      knowledgeChunkId: "chunk-1",
      connectionId: "connection-1",
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 4,
      embeddingVersion: 1,
      vector: [0.1, 0.2, 0.3, 0.4],
      checksum: "invalid-checksum",
      metadata: { chunkChecksum: computeChecksum("Enterprise knowledge chunk content.") },
    });

    await assert.rejects(
      () => env.versionService.activateEmbedding(ctx, bad.id),
      EmbeddingChecksumMismatchError,
    );
  });
});

describe("RBAC and isolation", () => {
  it("requires generate permission to enqueue jobs", async () => {
    const env = createEnvironment();
    const ctx = createContext({
      hasPermission: (code) => code === "embeddings.view",
    });

    const connection = await env.registryService.createConnection(createContext(), {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary",
      configuration: { model: "text-embedding-3-small", dimensions: 4 },
      isEnabled: true,
    });

    await assert.rejects(
      () =>
        env.jobService.enqueue(ctx, {
          companyId: "company-1",
          knowledgeChunkId: "chunk-1",
          connectionId: connection.id,
        }),
      PermissionDeniedError,
    );
  });

  it("enforces company isolation for chunks", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary",
      configuration: { model: "text-embedding-3-small", dimensions: 4 },
      isEnabled: true,
    });

    await assert.rejects(
      () =>
        env.jobService.enqueue(ctx, {
          companyId: "company-1",
          knowledgeChunkId: "chunk-2",
          connectionId: connection.id,
        }),
      ValidationError,
    );
  });

  it("rejects cancelling completed jobs", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary",
      configuration: { model: "text-embedding-3-small", dimensions: 4 },
      isEnabled: true,
    });

    const job = await env.jobService.enqueue(ctx, {
      companyId: "company-1",
      knowledgeChunkId: "chunk-1",
      connectionId: connection.id,
    });
    await env.jobService.processNext(ctx, "company-1");

    await assert.rejects(() => env.jobService.cancel(ctx, job.id), EmbeddingJobStateError);
  });
});

describe("Provider abstraction", () => {
  it("generates non-mock vectors through the OpenAI adapter contract", async () => {
    const env = createEnvironment();
    const provider = await env.factory.resolve({
      providerKey: "openai",
      configuration: { model: "text-embedding-3-small", dimensions: 4, apiKey: "test-key" },
    });

    const result = await provider.generateEmbedding({ text: "hello world" });
    assert.equal(result.dimensions, 4);
    assert.equal(result.vector.length, 4);
    assert.equal(result.mock, false);

    const health = await provider.health();
    assert.equal(health.status, "connected");
    assert.equal(health.mock, false);

    const models = await provider.models();
    assert.ok(models.models.length > 0);
  });

  it("computes stable embedding checksums", () => {
    const checksum = computeEmbeddingChecksum({
      chunkChecksum: "abc123",
      provider: "openai",
      model: "text-embedding-3-small",
      vector: [0.1, 0.2, 0.3, 0.4],
    });
    assert.match(checksum, /^[a-f0-9]{64}$/);
  });
});

describe("Batch queue processing", () => {
  it("processes queued jobs in batch and records telemetry", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary",
      configuration: { model: "text-embedding-3-small", dimensions: 4, apiKey: "test-key" },
      isEnabled: true,
    });

    await env.jobService.enqueue(ctx, {
      companyId: "company-1",
      knowledgeChunkId: "chunk-1",
      connectionId: connection.id,
    });

    const completed = await env.jobService.processBatch(ctx, "company-1", { limit: 4, batchSize: 4 });
    assert.equal(completed.length, 1);
    assert.equal(completed[0]?.status, "completed");
    assert.ok(env.telemetry.events.some((event) => event.operation === "generate_batch" && event.status === "succeeded"));
  });

  it("auto-requeues failed jobs until max retries are exhausted", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary",
      configuration: { model: "text-embedding-3-small", dimensions: 4, apiKey: "test-key" },
      isEnabled: true,
    });

    const job = await env.jobService.enqueue(ctx, {
      companyId: "company-1",
      knowledgeChunkId: "chunk-1",
      connectionId: connection.id,
    });

    const storedJob = env.jobs.find((item) => item.id === job.id)!;
    storedJob.max_retries = 2;

    const storedConnection = env.connections.find((item) => item.id === connection.id)!;
    storedConnection.is_enabled = false;

    let latest = storedJob;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      latest = (await env.jobService.processNext(ctx, "company-1")) ?? latest;
    }

    assert.equal(latest.status, "failed");
    assert.equal(latest.retry_count, 2);
    assert.match(String(latest.error_message), /connection/i);
  });

  it("enqueues jobs for all chunks in a version", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary",
      configuration: { model: "text-embedding-3-small", dimensions: 4, apiKey: "test-key" },
      isEnabled: true,
    });

    const jobs = await env.jobService.enqueueForVersion(ctx, {
      companyId: "company-1",
      versionId: "version-1",
      connectionId: connection.id,
    });

    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.status, "queued");
  });
});
