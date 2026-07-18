import type { EmbeddingPlatformServices } from "@workspace/embedding-platform";
import type {
  QueryEmbeddingPort,
  ServiceContext as RetrievalServiceContext,
} from "@workspace/retrieval-engine";
import type { VectorQueryServices } from "@workspace/vector-query";

type EmbeddingRegistry = EmbeddingPlatformServices["registry"];
type EmbeddingFactory = EmbeddingPlatformServices["factory"];
type VectorQueryManagement = VectorQueryServices["management"];

export function createQueryEmbeddingPort(deps: {
  registry: EmbeddingRegistry;
  factory: EmbeddingFactory;
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

      const provider = await deps.factory.resolve({
        providerKey,
        configuration: {
          ...connection.configuration,
          companyId: connection.company_id,
        },
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
};

export function createRetrievalPlatformPorts(deps: RetrievalPlatformDependencies) {
  return {
    queryEmbeddingPort: createQueryEmbeddingPort(deps.embedding),
    vectorQueryPort: createVectorQueryExecutionPort(deps.vectorQuery),
  };
}

export type { RetrievalServiceContext };
