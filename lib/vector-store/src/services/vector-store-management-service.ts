import { VECTOR_STORE_PERMISSIONS } from "../constants.js";
import { PermissionDeniedError } from "../errors.js";
import type {
  CreateManagedCollectionInput,
  IndexEmbeddingInput,
  RemoveIndexedVectorInput,
  ServiceContext,
} from "../types.js";
import type { VectorCollectionService } from "./vector-collection-service.js";
import type { VectorIndexService } from "./vector-index-service.js";
import type { VectorStoreProviderRegistryService } from "./vector-store-provider-registry-service.js";

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(VECTOR_STORE_PERMISSIONS.view);
  }
}

export class VectorStoreManagementService {
  constructor(
    private readonly registry: VectorStoreProviderRegistryService,
    private readonly collections: VectorCollectionService,
    private readonly index: VectorIndexService,
  ) {}

  async provisionCollection(ctx: ServiceContext, input: CreateManagedCollectionInput) {
    assertCompanyAccess(ctx, input.companyId);

    const collection = await this.collections.createCollection(ctx, input);
    return this.collections.activateCollection(ctx, collection.id);
  }

  async indexEmbedding(ctx: ServiceContext, input: IndexEmbeddingInput) {
    assertCompanyAccess(ctx, input.companyId);
    return this.index.registerIndexedVector(ctx, input);
  }

  async removeVector(ctx: ServiceContext, input: RemoveIndexedVectorInput) {
    assertCompanyAccess(ctx, input.companyId);
    return this.index.removeIndexedVector(ctx, input);
  }

  async decommissionCollection(ctx: ServiceContext, collectionId: string) {
    return this.collections.deleteCollection(ctx, collectionId);
  }

  async activateProviderConnection(ctx: ServiceContext, connectionId: string) {
    return this.registry.activateConnection(ctx, connectionId);
  }

  async disconnectProviderConnection(ctx: ServiceContext, connectionId: string) {
    return this.registry.disconnectConnection(ctx, connectionId);
  }
}
