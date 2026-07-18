import { VECTOR_STORE_PERMISSIONS } from "../constants.js";
import {
  PermissionDeniedError,
  ValidationError,
  VectorCollectionNotFoundError,
  VectorStoreConnectionNotFoundError,
} from "../errors.js";
import type { VectorStoreProviderFactory } from "../factory/vector-store-provider-factory.js";
import type {
  VectorCollectionRepository,
  VectorStoreConnectionRepository,
} from "../repositories/vector-store-repositories.js";
import type {
  CreateManagedCollectionInput,
  ListVectorCollectionsFilter,
  ServiceContext,
  VectorCollectionRecord,
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

export class VectorCollectionService {
  constructor(
    private readonly collectionRepository: VectorCollectionRepository,
    private readonly connectionRepository: VectorStoreConnectionRepository,
    private readonly factory: VectorStoreProviderFactory,
  ) {}

  async listCollections(
    ctx: ServiceContext,
    filter: ListVectorCollectionsFilter,
  ): Promise<VectorCollectionRecord[]> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    return this.collectionRepository.list(filter);
  }

  async getCollection(ctx: ServiceContext, collectionId: string): Promise<VectorCollectionRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.view);
    const collection = await this.collectionRepository.findById(collectionId);
    if (!collection) throw new VectorCollectionNotFoundError(collectionId);
    assertCompanyAccess(ctx, collection.company_id);
    return collection;
  }

  async createCollection(
    ctx: ServiceContext,
    input: CreateManagedCollectionInput,
  ): Promise<VectorCollectionRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.collectionsManage);
    assertCompanyAccess(ctx, input.companyId);

    const connection = await this.connectionRepository.findById(input.connectionId);
    if (!connection || !connection.is_enabled) {
      throw new VectorStoreConnectionNotFoundError(input.connectionId);
    }
    if (connection.company_id !== input.companyId) {
      throw new ValidationError("Vector store connection does not belong to the requested company.");
    }

    const providerKey = connection.vector_store_definition?.key;
    if (!providerKey) {
      throw new ValidationError("Vector store connection provider definition is missing.");
    }

    const provider = await this.factory.resolve({
      providerKey,
      configuration: enrichProviderConfiguration(connection.configuration, connection.company_id),
    });

    await provider.createCollection({
      name: input.name,
      dimensions: input.dimensions,
      metadata: input.metadata,
    });

    return this.collectionRepository.create({
      companyId: input.companyId,
      connectionId: input.connectionId,
      name: input.name,
      provider: providerKey,
      embeddingVersion: input.embeddingVersion,
      metadata: input.metadata ?? {},
      createdBy: ctx.userId,
    });
  }

  async activateCollection(ctx: ServiceContext, collectionId: string): Promise<VectorCollectionRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.collectionsManage);

    const collection = await this.getCollection(ctx, collectionId);
    await this.collectionRepository.deactivateActive(collection.company_id, collection.name);

    return this.collectionRepository.update({
      collectionId,
      status: "active",
      isActive: true,
    });
  }

  async deleteCollection(ctx: ServiceContext, collectionId: string): Promise<VectorCollectionRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.collectionsManage);

    const collection = await this.getCollection(ctx, collectionId);
    const connection = await this.connectionRepository.findById(collection.connection_id);
    if (!connection) {
      throw new VectorStoreConnectionNotFoundError(collection.connection_id);
    }

    const providerKey = connection.vector_store_definition?.key ?? collection.provider;
    const provider = await this.factory.resolve({
      providerKey,
      configuration: enrichProviderConfiguration(connection.configuration, connection.company_id),
    });

    await provider.deleteCollection({ name: collection.name });
    return this.collectionRepository.softDelete(collectionId, ctx.userId);
  }

  async updateCollectionMetadata(
    ctx: ServiceContext,
    collectionId: string,
    metadata: Record<string, unknown>,
  ): Promise<VectorCollectionRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.collectionsManage);
    await this.getCollection(ctx, collectionId);

    return this.collectionRepository.update({
      collectionId,
      metadata,
    });
  }
}
