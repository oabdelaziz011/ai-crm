import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueryProviderCapability } from "../../constants.js";
import { VectorQueryConfigurationError } from "../../errors.js";
import type { VectorQueryProvider } from "../../contracts/vector-query-provider.js";
import type {
  ConfigurationValidationResult,
  HealthResult,
  ProviderQueryInput,
  ProviderQueryResult,
  QueryStatisticsInput,
  QueryStatisticsResult,
} from "../../types.js";
import { validateAgainstSchema } from "../../utils/validate-configuration.js";
import {
  InMemoryPgVectorStorage,
  resolveCompanyId,
  SupabasePgVectorStorage,
  type PgVectorStoragePort,
} from "@workspace/vector-store";

const PGVECTOR_CONFIGURATION_SCHEMA = {
  type: "object",
  properties: {
    schema: { type: "string" },
    tablePrefix: { type: "string" },
    companyId: { type: "string" },
  },
  required: ["schema"],
} as const;

export class PgVectorQueryAdapter implements VectorQueryProvider {
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

  supportedCapabilities(): QueryProviderCapability[] {
    return ["similarity_query", "metadata_filter", "collection_statistics"];
  }

  async query(input: ProviderQueryInput): Promise<ProviderQueryResult> {
    const hits = await this.storage.similaritySearch({
      companyId: this.companyId(),
      collectionName: input.collectionName,
      queryVector: input.queryVector,
      topK: input.topK,
      metadataFilter: input.metadataFilters,
    });

    return {
      hits,
      providerKey: this.key,
      mock: false,
    };
  }

  async statistics(input: QueryStatisticsInput): Promise<QueryStatisticsResult> {
    const stats = await this.storage.collectionStatistics(this.companyId(), input.collectionName);
    return {
      collectionName: input.collectionName,
      indexedVectorCount: stats.vectorCount,
      providerKey: this.key,
      mock: false,
    };
  }
}

export function createPgVectorQueryAdapter(
  storage: PgVectorStoragePort,
  configuration: Record<string, unknown>,
): PgVectorQueryAdapter {
  if (!configuration.companyId) {
    throw new VectorQueryConfigurationError("pgvector query adapter requires configuration.companyId.");
  }
  return new PgVectorQueryAdapter(storage, configuration);
}

export function createPgVectorQueryAdapterFactory(options?: { client?: SupabaseClient }) {
  const storage = options?.client ? new SupabasePgVectorStorage(options.client) : new InMemoryPgVectorStorage();
  return (configuration: Record<string, unknown>) => createPgVectorQueryAdapter(storage, configuration);
}
