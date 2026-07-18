import { VectorStoreConfigurationError } from "../../errors.js";
import type { VectorStoreProvider } from "../provider-contract.js";
import type {
  CollectionStatisticsInput,
  CollectionStatisticsResult,
  ConfigurationValidationResult,
  CreateCollectionInput,
  CreateCollectionResult,
  DeleteCollectionInput,
  DeleteCollectionResult,
  DeleteVectorInput,
  DeleteVectorResult,
  HealthResult,
  UpsertVectorInput,
  UpsertVectorResult,
} from "../../types.js";
import { buildExternalReference } from "../../utils/vector-store-utils.js";
import { validateAgainstSchema } from "../../utils/validate-configuration.js";
import {
  InMemoryPgVectorStorage,
  resolveCompanyId,
  type PgVectorStoragePort,
} from "./pgvector-storage.js";

const PGVECTOR_CONFIGURATION_SCHEMA = {
  type: "object",
  properties: {
    schema: { type: "string" },
    tablePrefix: { type: "string" },
    companyId: { type: "string" },
  },
  required: ["schema"],
} as const;

export class PgVectorStoreAdapter implements VectorStoreProvider {
  readonly key = "pgvector";

  constructor(
    private readonly storage: PgVectorStoragePort,
    private readonly configuration: Record<string, unknown>,
  ) {}

  validateConfiguration(configuration: Record<string, unknown>): ConfigurationValidationResult {
    return validateAgainstSchema(PGVECTOR_CONFIGURATION_SCHEMA, configuration);
  }

  private companyId(): string {
    return resolveCompanyId(this.configuration);
  }

  async health(): Promise<HealthResult> {
    const validation = this.validateConfiguration(this.configuration);
    if (!validation.valid) {
      return {
        status: "warning",
        providerKey: this.key,
        message: validation.errors.join("; "),
        checkedAt: new Date().toISOString(),
        mock: false,
      };
    }

    const result = await this.storage.health();
    return {
      status: result.ok ? "connected" : "error",
      providerKey: this.key,
      message: result.message,
      checkedAt: new Date().toISOString(),
      mock: false,
    };
  }

  async createCollection(input: CreateCollectionInput): Promise<CreateCollectionResult> {
    if (!input.dimensions || input.dimensions <= 0) {
      throw new VectorStoreConfigurationError("Collection dimensions are required for pgvector.");
    }

    await this.storage.createCollection({
      companyId: this.companyId(),
      collectionName: input.name,
      dimensions: input.dimensions,
      metadata: input.metadata ?? {},
    });

    return {
      collectionName: input.name,
      providerKey: this.key,
      mock: false,
    };
  }

  async deleteCollection(input: DeleteCollectionInput): Promise<DeleteCollectionResult> {
    await this.storage.deleteCollection(this.companyId(), input.name);
    return {
      collectionName: input.name,
      deleted: true,
      mock: false,
    };
  }

  async upsertVector(input: UpsertVectorInput): Promise<UpsertVectorResult> {
    const result = await this.storage.upsertVector({
      companyId: this.companyId(),
      collectionName: input.collectionName,
      vectorId: input.vectorId,
      vector: input.vector,
      metadata: input.metadata ?? {},
    });

    return {
      collectionName: input.collectionName,
      vectorId: input.vectorId,
      externalReference: result.id || buildExternalReference(this.key, input.collectionName, input.vectorId),
      mock: false,
    };
  }

  async deleteVector(input: DeleteVectorInput): Promise<DeleteVectorResult> {
    await this.storage.deleteVector(this.companyId(), input.collectionName, input.vectorId);
    return {
      collectionName: input.collectionName,
      vectorId: input.vectorId,
      deleted: true,
      mock: false,
    };
  }

  async collectionStatistics(input: CollectionStatisticsInput): Promise<CollectionStatisticsResult> {
    const stats = await this.storage.collectionStatistics(this.companyId(), input.collectionName);
    return {
      collectionName: input.collectionName,
      vectorCount: stats.vectorCount,
      dimensions: stats.dimensions,
      providerKey: this.key,
      mock: false,
    };
  }
}

export function createPgVectorStoreAdapter(
  storage: PgVectorStoragePort,
  configuration: Record<string, unknown>,
): PgVectorStoreAdapter {
  return new PgVectorStoreAdapter(storage, configuration);
}

export function createInMemoryPgVectorStoreAdapter(configuration: Record<string, unknown>): PgVectorStoreAdapter {
  return new PgVectorStoreAdapter(new InMemoryPgVectorStorage(), configuration);
}
