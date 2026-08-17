import type { EmbeddingPlatformServices } from "@workspace/embedding-platform";
import type {
  QueryEmbeddingPort,
  ServiceContext as RetrievalServiceContext,
  EmbeddingPlatformConfigurationResolver,
} from "@workspace/retrieval-engine";
import type { VectorQueryServices } from "@workspace/vector-query";
import { platformAiEmbeddings } from "@/lib/platform-ai/platform-ai-api-client";

type EmbeddingRegistry = EmbeddingPlatformServices["registry"];
type EmbeddingFactory = EmbeddingPlatformServices["factory"];
type VectorQueryManagement = VectorQueryServices["management"];

function connectionNeedsPlatformKey(configuration: Record<string, unknown>): boolean {
  const apiKey =
    typeof configuration.apiKey === "string"
      ? configuration.apiKey
      : typeof configuration.api_key === "string"
        ? configuration.api_key
        : "";
  return !apiKey.trim();
}

function configurationRequestsPlatformProxy(configuration: Record<string, unknown>): boolean {
  return configuration.__platformApiProxy === true || configuration.usesPlatformKey === true;
}

export function createQueryEmbeddingPort(deps: {
  registry: EmbeddingRegistry;
  factory: EmbeddingFactory;
  resolvePlatformConfiguration?: EmbeddingPlatformConfigurationResolver;
}): QueryEmbeddingPort {
  return {
    async generateQueryEmbedding(ctx, input) {
      const connection = await deps.registry.getConnection(ctx as never, input.connectionId);
      if (connection.company_id !== input.companyId) {
        throw new Error("Embedding connection does not belong to the requested company.");
      }

      const providerKey = connection.embedding_provider_definition?.key;
      if (!providerKey) {
        throw new Error("Embedding connection provider definition is missing.");
      }

      const model =
        input.model ??
        (typeof connection.configuration.model === "string" ? connection.configuration.model : null) ??
        connection.embedding_provider_definition?.default_model;
      if (!model) {
        throw new Error("Embedding model is required.");
      }

      let mergedConfiguration: Record<string, unknown> = {
        ...connection.configuration,
        companyId: connection.company_id,
      };

      if (connectionNeedsPlatformKey(connection.configuration) && deps.resolvePlatformConfiguration) {
        const platformConfiguration = await deps.resolvePlatformConfiguration({
          companyId: input.companyId,
          providerKey,
        });
        mergedConfiguration = {
          ...mergedConfiguration,
          ...platformConfiguration,
          ...(typeof platformConfiguration.model === "string" && platformConfiguration.model
            ? { model: platformConfiguration.model }
            : {}),
        };
      }

      // Platform-managed keys: never decrypt/embed in the browser.
      if (
        connectionNeedsPlatformKey(connection.configuration) ||
        configurationRequestsPlatformProxy(mergedConfiguration)
      ) {
        const response = await platformAiEmbeddings({
          companyId: input.companyId,
          providerKey,
          model,
          input: input.text,
        });
        const vector = response.vector ?? response.vectors[0];
        if (!vector) {
          throw new Error("Platform AI embeddings response did not include a vector.");
        }
        return {
          vector,
          dimensions: response.dimensions,
          providerKey: response.providerKey,
          model: response.model,
          mock: false,
        };
      }

      const provider = await deps.factory.resolve({
        providerKey,
        configuration: mergedConfiguration,
      });

      const result = await provider.generateEmbedding({
        text: input.text,
        model,
        metadata: { purpose: "query_embedding" },
      });

      return {
        vector: result.vector,
        dimensions: result.dimensions,
        providerKey: result.providerKey,
        model: result.model,
        mock: result.mock,
      };
    },
  };
}

export function createVectorQueryExecutionPort(deps: {
  management: VectorQueryManagement;
}): import("@workspace/retrieval-engine").VectorQueryExecutionPort {
  return {
    async executeVectorQuery(ctx, input) {
      const response = await deps.management.executeQuery(ctx as never, {
        companyId: input.companyId,
        connectionId: input.connectionId,
        collectionId: input.collectionId,
        queryVector: input.queryVector,
        policyId: input.policyId,
        topK: input.topK,
        minimumScore: input.minimumScore,
        metadataFilters: input.metadataFilters as never,
        correlationId: input.correlationId,
      });

      return {
        executionId: response.executionId,
        correlationId: response.correlationId,
        executionTimeMs: response.executionTimeMs,
        provider: response.provider,
        collectionId: response.collectionId,
        policyId: response.policyId,
        resultCount: response.resultCount,
      };
    },
  };
}

export type RetrievalPlatformDependencies = {
  embedding: Pick<EmbeddingPlatformServices, "registry" | "factory">;
  vectorQuery: Pick<VectorQueryServices, "management">;
  resolvePlatformConfiguration?: EmbeddingPlatformConfigurationResolver;
};

export function createRetrievalPlatformPorts(deps: RetrievalPlatformDependencies) {
  return {
    queryEmbeddingPort: createQueryEmbeddingPort({
      ...deps.embedding,
      resolvePlatformConfiguration: deps.resolvePlatformConfiguration,
    }),
    vectorQueryPort: createVectorQueryExecutionPort(deps.vectorQuery),
  };
}

export type { RetrievalServiceContext };
