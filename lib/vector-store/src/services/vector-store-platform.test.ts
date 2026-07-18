import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultVectorStoreProviderFactory } from "../factory/vector-store-provider-factory.js";
import {
  KnowledgeEmbeddingNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type {
  IndexedVectorRepository,
  KnowledgeEmbeddingReader,
  VectorCollectionRepository,
  VectorStoreConnectionRepository,
  VectorStoreDefinitionRepository,
} from "../repositories/vector-store-repositories.js";
import { VectorCollectionService } from "./vector-collection-service.js";
import { VectorIndexService } from "./vector-index-service.js";
import { VectorStoreManagementService } from "./vector-store-management-service.js";
import { VectorStoreProviderRegistryService } from "./vector-store-provider-registry-service.js";
import type {
  IndexedVectorRecord,
  KnowledgeEmbeddingSnapshot,
  ServiceContext,
  VectorCollectionRecord,
  VectorStoreConnectionRecord,
  VectorStoreDefinitionRecord,
} from "../types.js";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      ["vectorstores.view", "vectorstores.manage", "collections.manage"].includes(code),
    ...overrides,
  };
}

function createEnvironment() {
  const definitions: VectorStoreDefinitionRecord[] = [
    {
      id: "provider-def-1",
      key: "pgvector",
      display_name: "PGVector",
      description: "",
      icon: null,
      supported_capabilities: [
        "create_collection",
        "delete_collection",
        "upsert_vector",
        "delete_vector",
        "collection_statistics",
      ],
      configuration_schema: {
        type: "object",
        properties: { schema: { type: "string" }, tablePrefix: { type: "string" } },
        required: ["schema"],
      },
      default_configuration: { schema: "public", tablePrefix: "vs_" },
      is_active: true,
      version: "1.0.0",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const connections: VectorStoreConnectionRecord[] = [];
  const collections: VectorCollectionRecord[] = [];
  const indexedVectors: IndexedVectorRecord[] = [];
  const embeddings = new Map<string, KnowledgeEmbeddingSnapshot>([
    [
      "embedding-1",
      {
        id: "embedding-1",
        company_id: "company-1",
        knowledge_chunk_id: "chunk-1",
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 4,
        embedding_version: 1,
        vector: [0.1, 0.2, 0.3, 0.4],
        checksum: "abc123",
        is_active: true,
        status: "active",
      },
    ],
    [
      "embedding-2",
      {
        id: "embedding-2",
        company_id: "company-2",
        knowledge_chunk_id: "chunk-2",
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 4,
        embedding_version: 1,
        vector: [0.5, 0.6, 0.7, 0.8],
        checksum: "def456",
        is_active: true,
        status: "active",
      },
    ],
  ]);

  const definitionRepository: VectorStoreDefinitionRepository = {
    listActive: async () => definitions.filter((item) => item.is_active),
    listAll: async () => definitions,
    findById: async (id) => definitions.find((item) => item.id === id) ?? null,
    findByKey: async (key) => definitions.find((item) => item.key === key) ?? null,
  };

  const connectionRepository: VectorStoreConnectionRepository = {
    create: async (input) => {
      const record: VectorStoreConnectionRecord = {
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
        vector_store_definition: definitions.find((item) => item.id === input.providerId) ?? null,
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
        status: input.status ?? record.status,
        health_status: input.healthStatus ?? record.health_status,
        last_health_check: input.lastHealthCheck ?? record.last_health_check,
      });
      return record;
    },
    softDelete: async (connectionId) => {
      const record = connections.find((item) => item.id === connectionId)!;
      record.deleted_at = new Date().toISOString();
      record.is_enabled = false;
      return record;
    },
  };

  const collectionRepository: VectorCollectionRepository = {
    create: async (input) => {
      const record: VectorCollectionRecord = {
        id: `collection-${collections.length + 1}`,
        company_id: input.companyId,
        connection_id: input.connectionId,
        name: input.name,
        provider: input.provider,
        embedding_version: input.embeddingVersion,
        status: "pending",
        is_active: false,
        metadata: input.metadata ?? {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
        created_by: input.createdBy ?? null,
      };
      collections.push(record);
      return record;
    },
    findById: async (id) => collections.find((item) => item.id === id && !item.deleted_at) ?? null,
    list: async (filter) =>
      collections.filter((item) => item.company_id === filter.companyId && !item.deleted_at),
    update: async (input) => {
      const record = collections.find((item) => item.id === input.collectionId)!;
      Object.assign(record, {
        status: input.status ?? record.status,
        is_active: input.isActive ?? record.is_active,
        metadata: input.metadata ?? record.metadata,
        embedding_version: input.embeddingVersion ?? record.embedding_version,
      });
      return record;
    },
    softDelete: async (collectionId, deletedBy) => {
      const record = collections.find((item) => item.id === collectionId)!;
      record.deleted_at = new Date().toISOString();
      record.deleted_by = deletedBy ?? null;
      record.status = "archived";
      record.is_active = false;
      return record;
    },
    deactivateActive: async (companyId, name) => {
      for (const item of collections) {
        if (item.company_id === companyId && item.name === name && item.is_active) {
          item.is_active = false;
        }
      }
    },
  };

  const indexedVectorRepository: IndexedVectorRepository = {
    create: async (input) => {
      const record: IndexedVectorRecord = {
        id: `indexed-${indexedVectors.length + 1}`,
        company_id: input.companyId,
        knowledge_embedding_id: input.knowledgeEmbeddingId,
        collection_id: input.collectionId,
        provider: input.provider,
        external_reference: input.externalReference,
        status: input.status ?? "pending",
        metadata: input.metadata ?? {},
        indexed_at: input.indexedAt ?? null,
        removed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: input.createdBy ?? null,
      };
      indexedVectors.push(record);
      return record;
    },
    findById: async (id) => indexedVectors.find((item) => item.id === id) ?? null,
    list: async (filter) =>
      indexedVectors.filter((item) => {
        if (item.company_id !== filter.companyId) return false;
        if (filter.collectionId && item.collection_id !== filter.collectionId) return false;
        return true;
      }),
    update: async (input) => {
      const record = indexedVectors.find((item) => item.id === input.indexedVectorId)!;
      Object.assign(record, {
        status: input.status ?? record.status,
        external_reference: input.externalReference ?? record.external_reference,
        metadata: input.metadata ?? record.metadata,
        indexed_at: input.indexedAt ?? record.indexed_at,
        removed_at: input.removedAt ?? record.removed_at,
      });
      return record;
    },
    findByEmbeddingAndCollection: async (knowledgeEmbeddingId, collectionId) =>
      indexedVectors.find(
        (item) =>
          item.knowledge_embedding_id === knowledgeEmbeddingId &&
          item.collection_id === collectionId &&
          item.status !== "removed",
      ) ?? null,
  };

  const embeddingReader: KnowledgeEmbeddingReader = {
    findById: async (embeddingId) => embeddings.get(embeddingId) ?? null,
  };

  const factory = createDefaultVectorStoreProviderFactory(definitionRepository);
  const registryService = new VectorStoreProviderRegistryService(
    definitionRepository,
    connectionRepository,
    factory,
  );
  const collectionService = new VectorCollectionService(
    collectionRepository,
    connectionRepository,
    factory,
  );
  const indexService = new VectorIndexService(
    indexedVectorRepository,
    collectionRepository,
    connectionRepository,
    embeddingReader,
    factory,
  );
  const managementService = new VectorStoreManagementService(registryService, collectionService, indexService);

  return {
    definitions,
    connections,
    collections,
    indexedVectors,
    embeddings,
    factory,
    registryService,
    collectionService,
    indexService,
    managementService,
  };
}

describe("VectorStoreProviderRegistryService", () => {
  it("lists provider types and supported adapters", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const types = await env.registryService.listProviderTypes(ctx);
    assert.equal(types.length, 1);
    assert.equal(types[0]?.key, "pgvector");

    const keys = await env.registryService.getSupportedAdapterKeys(ctx);
    assert.ok(keys.includes("pgvector"));
    assert.ok(keys.includes("pinecone"));
    assert.ok(keys.includes("qdrant"));
    assert.ok(keys.includes("chroma"));
    assert.ok(keys.includes("azure_ai_search"));
  });

  it("creates and activates connections", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary PGVector",
      configuration: { schema: "public", tablePrefix: "vs_" },
      isEnabled: true,
    });

    const activated = await env.registryService.activateConnection(ctx, connection.id);
    assert.equal(activated.is_enabled, true);
    assert.equal(activated.status, "active");
    assert.equal(activated.health_status, "connected");
  });

  it("disconnects provider connections", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary PGVector",
      configuration: { schema: "public", tablePrefix: "vs_" },
      isEnabled: true,
    });

    const disconnected = await env.registryService.disconnectConnection(ctx, connection.id);
    assert.equal(disconnected.is_enabled, false);
    assert.equal(disconnected.health_status, "disconnected");
  });
});

describe("VectorCollectionService", () => {
  it("creates and activates collections with embedding version tracking", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary PGVector",
      configuration: { schema: "public", tablePrefix: "vs_" },
      isEnabled: true,
    });

    const created = await env.collectionService.createCollection(ctx, {
      companyId: "company-1",
      connectionId: connection.id,
      name: "knowledge-v1",
      embeddingVersion: 1,
      dimensions: 4,
    });
    assert.equal(created.embedding_version, 1);
    assert.equal(created.status, "pending");

    const active = await env.collectionService.activateCollection(ctx, created.id);
    assert.equal(active.is_active, true);
    assert.equal(active.status, "active");
  });

  it("deletes collections through provider adapter", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary PGVector",
      configuration: { schema: "public", tablePrefix: "vs_" },
      isEnabled: true,
    });

    const created = await env.collectionService.createCollection(ctx, {
      companyId: "company-1",
      connectionId: connection.id,
      name: "knowledge-v1",
      embeddingVersion: 1,
      dimensions: 4,
    });

    const deleted = await env.collectionService.deleteCollection(ctx, created.id);
    assert.equal(deleted.status, "archived");
    assert.ok(deleted.deleted_at);
  });
});

describe("VectorIndexService", () => {
  it("registers indexed vectors for active embeddings", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary PGVector",
      configuration: { schema: "public", tablePrefix: "vs_" },
      isEnabled: true,
    });

    const collection = await env.managementService.provisionCollection(ctx, {
      companyId: "company-1",
      connectionId: connection.id,
      name: "knowledge-v1",
      embeddingVersion: 1,
      dimensions: 4,
    });

    const indexed = await env.indexService.registerIndexedVector(ctx, {
      companyId: "company-1",
      collectionId: collection.id,
      knowledgeEmbeddingId: "embedding-1",
    });

    assert.equal(indexed.status, "indexed");
    assert.ok(indexed.external_reference);
    assert.ok(indexed.indexed_at);
  });

  it("removes indexed vectors", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary PGVector",
      configuration: { schema: "public", tablePrefix: "vs_" },
      isEnabled: true,
    });

    const collection = await env.managementService.provisionCollection(ctx, {
      companyId: "company-1",
      connectionId: connection.id,
      name: "knowledge-v1",
      embeddingVersion: 1,
      dimensions: 4,
    });

    const indexed = await env.indexService.registerIndexedVector(ctx, {
      companyId: "company-1",
      collectionId: collection.id,
      knowledgeEmbeddingId: "embedding-1",
    });

    const removed = await env.indexService.removeIndexedVector(ctx, {
      companyId: "company-1",
      indexedVectorId: indexed.id,
    });

    assert.equal(removed.status, "removed");
    assert.ok(removed.removed_at);
  });
});

describe("VectorStoreManagementService", () => {
  it("orchestrates collection provisioning and indexing lifecycle", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary PGVector",
      configuration: { schema: "public", tablePrefix: "vs_" },
      isEnabled: true,
    });

    const collection = await env.managementService.provisionCollection(ctx, {
      companyId: "company-1",
      connectionId: connection.id,
      name: "enterprise-knowledge",
      embeddingVersion: 1,
      dimensions: 4,
    });

    const indexed = await env.managementService.indexEmbedding(ctx, {
      companyId: "company-1",
      collectionId: collection.id,
      knowledgeEmbeddingId: "embedding-1",
    });

    assert.equal(indexed.status, "indexed");

    const stats = await env.factory.resolve({
      providerKey: "pgvector",
      configuration: { schema: "public", tablePrefix: "vs_", companyId: "company-1" },
    });
    const collectionStats = await stats.collectionStatistics({ collectionName: collection.name });
    assert.equal(collectionStats.mock, false);
    assert.equal(collectionStats.vectorCount, 1);
  });
});

describe("RBAC and isolation", () => {
  it("requires collections.manage permission to index vectors", async () => {
    const env = createEnvironment();
    const ctx = createContext({
      hasPermission: (code) => code === "vectorstores.view",
    });

    await assert.rejects(
      () =>
        env.indexService.registerIndexedVector(ctx, {
          companyId: "company-1",
          collectionId: "collection-1",
          knowledgeEmbeddingId: "embedding-1",
        }),
      PermissionDeniedError,
    );
  });

  it("enforces company isolation for embeddings", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary PGVector",
      configuration: { schema: "public", tablePrefix: "vs_" },
      isEnabled: true,
    });

    const collection = await env.managementService.provisionCollection(ctx, {
      companyId: "company-1",
      connectionId: connection.id,
      name: "knowledge-v1",
      embeddingVersion: 1,
      dimensions: 4,
    });

    await assert.rejects(
      () =>
        env.indexService.registerIndexedVector(ctx, {
          companyId: "company-1",
          collectionId: collection.id,
          knowledgeEmbeddingId: "embedding-2",
        }),
      ValidationError,
    );
  });

  it("rejects indexing missing embeddings", async () => {
    const env = createEnvironment();
    const ctx = createContext();

    const connection = await env.registryService.createConnection(ctx, {
      companyId: "company-1",
      providerId: "provider-def-1",
      displayName: "Primary PGVector",
      configuration: { schema: "public", tablePrefix: "vs_" },
      isEnabled: true,
    });

    const collection = await env.managementService.provisionCollection(ctx, {
      companyId: "company-1",
      connectionId: connection.id,
      name: "knowledge-v1",
      embeddingVersion: 1,
      dimensions: 4,
    });

    await assert.rejects(
      () =>
        env.indexService.registerIndexedVector(ctx, {
          companyId: "company-1",
          collectionId: collection.id,
          knowledgeEmbeddingId: "missing-embedding",
        }),
      KnowledgeEmbeddingNotFoundError,
    );
  });
});

describe("Provider abstraction", () => {
  it("implements storage contract without search", async () => {
    const env = createEnvironment();
    const provider = await env.factory.resolve({
      providerKey: "pgvector",
      configuration: { schema: "public", tablePrefix: "vs_", companyId: "company-1" },
    });

    const health = await provider.health();
    assert.equal(health.mock, false);

    const created = await provider.createCollection({ name: "test", dimensions: 4 });
    assert.equal(created.collectionName, "test");

    const upserted = await provider.upsertVector({
      collectionName: "test",
      vectorId: "vec-1",
      vector: [0.1, 0.2, 0.3, 0.4],
    });
    assert.ok(upserted.externalReference);

    const stats = await provider.collectionStatistics({ collectionName: "test" });
    assert.equal(stats.mock, false);
    assert.equal(stats.vectorCount, 1);

    const deleted = await provider.deleteVector({ collectionName: "test", vectorId: "vec-1" });
    assert.equal(deleted.deleted, true);

    const removed = await provider.deleteCollection({ name: "test" });
    assert.equal(removed.deleted, true);

    assert.equal("search" in provider, false);
  });
});
