import type { SupabaseClient } from "@supabase/supabase-js";
import { validateAgainstSchema } from "../utils/validate-configuration.js";
import { computeStubSimilarity, matchesMetadataFilter } from "../utils/query-utils.js";
import type { VectorQueryProviderAdapterFactory } from "../contracts/vector-query-provider.js";
import type { ConfigurationValidationResult } from "../types.js";
import { createPgVectorQueryAdapterFactory } from "./pgvector/pgvector-query-adapter.js";

type StubQueryAdapterOptions = {
  key: string;
  displayName: string;
  configurationSchema: Record<string, unknown>;
  validateConfiguration: (configuration: Record<string, unknown>) => ConfigurationValidationResult;
};

function createStubQueryAdapter(options: StubQueryAdapterOptions): VectorQueryProviderAdapterFactory {
  return (configuration) => ({
    key: options.key,
    validateConfiguration: options.validateConfiguration,
    async health() {
      const validation = options.validateConfiguration(configuration);
      return {
        status: validation.valid ? "connected" : "warning",
        providerKey: options.key,
        message: validation.valid
          ? `${options.displayName} stub query adapter is configured.`
          : validation.errors.join("; "),
        checkedAt: new Date().toISOString(),
        mock: true as const,
      };
    },
    supportedCapabilities() {
      return ["similarity_query", "metadata_filter", "collection_statistics"];
    },
    async query(input) {
      const candidates = buildStubCandidates(input.collectionName);
      const filtered = candidates.filter((candidate) => matchesMetadataFilter(candidate.metadata, input.metadataFilters));
      const hits = filtered
        .map((candidate) => ({
          vectorId: candidate.vectorId,
          providerScore: computeStubSimilarity(input.queryVector, candidate.vector) * 100,
          metadata: candidate.metadata,
        }))
        .sort((left, right) => right.providerScore - left.providerScore)
        .slice(0, input.topK);

      return {
        hits,
        providerKey: options.key,
        mock: true as const,
      };
    },
    async statistics(input) {
      return {
        collectionName: input.collectionName,
        indexedVectorCount: buildStubCandidates(input.collectionName).length,
        providerKey: options.key,
        mock: true as const,
      };
    },
  });
}

function buildStubCandidates(collectionName: string) {
  return [
    {
      vectorId: "embedding-1",
      vector: [0.12, 0.34, 0.56, 0.78],
      metadata: {
        document_type: "policy",
        knowledge_source: "manual",
        department: "legal",
        language: "en",
        tags: ["compliance"],
        company: "company-1",
        collection: collectionName,
      },
    },
    {
      vectorId: "embedding-2",
      vector: [0.45, 0.23, 0.67, 0.11],
      metadata: {
        document_type: "faq",
        knowledge_source: "website",
        department: "support",
        language: "en",
        tags: ["help"],
        company: "company-1",
        collection: collectionName,
      },
    },
    {
      vectorId: "embedding-3",
      vector: [0.88, 0.44, 0.22, 0.09],
      metadata: {
        document_type: "policy",
        knowledge_source: "pdf",
        department: "hr",
        language: "ar",
        tags: ["hr"],
        company: "company-2",
        collection: collectionName,
      },
    },
  ];
}

const pineconeSchema = {
  type: "object",
  properties: { environment: { type: "string" }, indexName: { type: "string" } },
  required: ["environment", "indexName"],
};

const qdrantSchema = {
  type: "object",
  properties: { url: { type: "string" } },
  required: ["url"],
};

const chromaSchema = {
  type: "object",
  properties: { host: { type: "string" }, port: { type: "number" } },
  required: ["host"],
};

const azureSchema = {
  type: "object",
  properties: { endpoint: { type: "string" }, indexName: { type: "string" } },
  required: ["endpoint", "indexName"],
};

export const PineconeQueryAdapter = createStubQueryAdapter({
  key: "pinecone",
  displayName: "Pinecone Query",
  configurationSchema: pineconeSchema,
  validateConfiguration: (configuration) => validateAgainstSchema(pineconeSchema, configuration),
});

export const QdrantQueryAdapter = createStubQueryAdapter({
  key: "qdrant",
  displayName: "Qdrant Query",
  configurationSchema: qdrantSchema,
  validateConfiguration: (configuration) => validateAgainstSchema(qdrantSchema, configuration),
});

export const ChromaQueryAdapter = createStubQueryAdapter({
  key: "chroma",
  displayName: "Chroma Query",
  configurationSchema: chromaSchema,
  validateConfiguration: (configuration) => validateAgainstSchema(chromaSchema, configuration),
});

export const AzureAISearchQueryAdapter = createStubQueryAdapter({
  key: "azure_ai_search",
  displayName: "Azure AI Search Query",
  configurationSchema: azureSchema,
  validateConfiguration: (configuration) => validateAgainstSchema(azureSchema, configuration),
});

export function createVectorQueryAdapters(options?: { client?: SupabaseClient }) {
  return {
    pgvector: createPgVectorQueryAdapterFactory(options),
    pinecone: PineconeQueryAdapter,
    qdrant: QdrantQueryAdapter,
    chroma: ChromaQueryAdapter,
    azure_ai_search: AzureAISearchQueryAdapter,
  };
}

/** @deprecated Use createVectorQueryAdapters */
export const createStubVectorQueryAdapters = createVectorQueryAdapters;
