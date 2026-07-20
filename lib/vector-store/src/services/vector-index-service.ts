import { VECTOR_STORE_PERMISSIONS } from "../constants.js";
import {
  IndexedVectorNotFoundError,
  KnowledgeEmbeddingNotFoundError,
  PermissionDeniedError,
  ValidationError,
  VectorCollectionNotFoundError,
  VectorStoreConnectionNotFoundError,
} from "../errors.js";
import type { VectorStoreProviderFactory } from "../factory/vector-store-provider-factory.js";
import type {
  IndexedVectorRepository,
  KnowledgeEmbeddingReader,
  VectorCollectionRepository,
  VectorStoreConnectionRepository,
} from "../repositories/vector-store-repositories.js";
import type {
  IndexEmbeddingInput,
  IndexedVectorRecord,
  ListIndexedVectorsFilter,
  RemoveIndexedVectorInput,
  ServiceContext,
} from "../types.js";
import { enrichProviderConfiguration } from "../utils/enrich-provider-configuration.js";

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(VECTOR_STORE_PERMISSIONS.view);
  }
}

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

export class VectorIndexService {
  constructor(
    private readonly indexedVectorRepository: IndexedVectorRepository,
    private readonly collectionRepository: VectorCollectionRepository,
    private readonly connectionRepository: VectorStoreConnectionRepository,
    private readonly embeddingReader: KnowledgeEmbeddingReader,
    private readonly factory: VectorStoreProviderFactory,
  ) {}

  async listIndexedVectors(
    ctx: ServiceContext,
    filter: ListIndexedVectorsFilter,
  ): Promise<IndexedVectorRecord[]> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    return this.indexedVectorRepository.list(filter);
  }

  async getIndexedVector(ctx: ServiceContext, indexedVectorId: string): Promise<IndexedVectorRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.view);
    const record = await this.indexedVectorRepository.findById(indexedVectorId);
    if (!record) throw new IndexedVectorNotFoundError(indexedVectorId);
    assertCompanyAccess(ctx, record.company_id);
    return record;
  }

  async registerIndexedVector(
    ctx: ServiceContext,
    input: IndexEmbeddingInput,
  ): Promise<IndexedVectorRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.collectionsManage);
    assertCompanyAccess(ctx, input.companyId);

    const collection = await this.collectionRepository.findById(input.collectionId);
    if (!collection || !collection.is_active) {
      throw new VectorCollectionNotFoundError(input.collectionId);
    }
    if (collection.company_id !== input.companyId) {
      throw new ValidationError("Vector collection does not belong to the requested company.");
    }

    const embedding = await this.embeddingReader.findById(input.knowledgeEmbeddingId);
    if (!embedding) {
      throw new KnowledgeEmbeddingNotFoundError(input.knowledgeEmbeddingId);
    }
    if (embedding.company_id !== input.companyId) {
      throw new ValidationError("Knowledge embedding does not belong to the requested company.");
    }
    if (!embedding.is_active || embedding.status !== "active") {
      throw new ValidationError("Only active knowledge embeddings can be indexed.");
    }
    if (embedding.embedding_version !== collection.embedding_version) {
      throw new ValidationError("Embedding version does not match collection embedding version.");
    }

    const connection = await this.connectionRepository.findById(collection.connection_id);
    if (!connection || !connection.is_enabled) {
      throw new VectorStoreConnectionNotFoundError(collection.connection_id);
    }

    const providerKey = connection.vector_store_definition?.key ?? collection.provider;
    const provider = await this.factory.resolve({
      providerKey,
      configuration: enrichProviderConfiguration(connection.configuration, connection.company_id),
    });

    const existing = await this.indexedVectorRepository.findByEmbeddingAndCollection(
      input.knowledgeEmbeddingId,
      input.collectionId,
    );
    if (existing && existing.status === "indexed") {
      return existing;
    }
    if (existing && existing.status !== "removed") {
      throw new ValidationError("Knowledge embedding is already indexed in this collection.");
    }

    const upsertResult = await provider.upsertVector({
      collectionName: collection.name,
      vectorId: embedding.id,
      vector: embedding.vector,
      metadata: {
        knowledgeChunkId: embedding.knowledge_chunk_id,
        embeddingVersion: embedding.embedding_version,
        checksum: embedding.checksum,
      },
    });

    const now = new Date().toISOString();
    if (existing) {
      return this.indexedVectorRepository.update({
        indexedVectorId: existing.id,
        status: "indexed",
        externalReference: upsertResult.externalReference,
        indexedAt: now,
        removedAt: null,
        metadata: {
          provider: providerKey,
          model: embedding.model,
          dimensions: embedding.dimensions,
        },
      });
    }

    return this.indexedVectorRepository.create({
      companyId: input.companyId,
      knowledgeEmbeddingId: input.knowledgeEmbeddingId,
      collectionId: input.collectionId,
      provider: providerKey,
      externalReference: upsertResult.externalReference,
      status: "indexed",
      indexedAt: now,
      metadata: {
        provider: providerKey,
        model: embedding.model,
        dimensions: embedding.dimensions,
      },
      createdBy: ctx.userId,
    });
  }

  async removeIndexedVector(ctx: ServiceContext, input: RemoveIndexedVectorInput): Promise<IndexedVectorRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.collectionsManage);
    assertCompanyAccess(ctx, input.companyId);

    const indexed = await this.getIndexedVector(ctx, input.indexedVectorId);
    if (indexed.company_id !== input.companyId) {
      throw new ValidationError("Indexed vector does not belong to the requested company.");
    }
    if (indexed.status === "removed") {
      return indexed;
    }

    const collection = await this.collectionRepository.findById(indexed.collection_id);
    if (!collection) {
      throw new VectorCollectionNotFoundError(indexed.collection_id);
    }

    const connection = await this.connectionRepository.findById(collection.connection_id);
    if (!connection) {
      throw new VectorStoreConnectionNotFoundError(collection.connection_id);
    }

    const providerKey = connection.vector_store_definition?.key ?? indexed.provider;
    const provider = await this.factory.resolve({
      providerKey,
      configuration: enrichProviderConfiguration(connection.configuration, connection.company_id),
    });

    await provider.deleteVector({
      collectionName: collection.name,
      vectorId: indexed.knowledge_embedding_id,
    });

    return this.indexedVectorRepository.update({
      indexedVectorId: indexed.id,
      status: "removed",
      removedAt: new Date().toISOString(),
    });
  }

  async updateIndexStatus(
    ctx: ServiceContext,
    indexedVectorId: string,
    status: IndexedVectorRecord["status"],
  ): Promise<IndexedVectorRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.collectionsManage);
    await this.getIndexedVector(ctx, indexedVectorId);

    return this.indexedVectorRepository.update({
      indexedVectorId,
      status,
    });
  }
}
