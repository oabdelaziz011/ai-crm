import type { SupabaseClient } from "@supabase/supabase-js";
import { validateAgainstSchema } from "../utils/validate-configuration.js";
import { createStubVectorStoreProvider } from "./provider-contract.js";
import { createPgVectorStoreAdapter } from "./pgvector/pgvector-store-adapter.js";
import { InMemoryPgVectorStorage, SupabasePgVectorStorage } from "./pgvector/pgvector-storage.js";

const pineconeSchema = {
  type: "object",
  properties: { environment: { type: "string" }, indexName: { type: "string" } },
  required: ["environment", "indexName"],
};

const qdrantSchema = {
  type: "object",
  properties: { url: { type: "string" }, apiKey: { type: "string" } },
  required: ["url"],
};

const chromaSchema = {
  type: "object",
  properties: { host: { type: "string" }, port: { type: "number" } },
  required: ["host"],
};

const azureSchema = {
  type: "object",
  properties: {
    endpoint: { type: "string" },
    indexName: { type: "string" },
    apiVersion: { type: "string" },
  },
  required: ["endpoint", "indexName"],
};

export function createVectorStoreAdapters(options?: { client?: SupabaseClient }) {
  const pgvectorStorage = options?.client
    ? new SupabasePgVectorStorage(options.client)
    : new InMemoryPgVectorStorage();

  return {
    pgvector: (configuration: Record<string, unknown>) =>
      createPgVectorStoreAdapter(pgvectorStorage, configuration),
    pinecone: createStubVectorStoreProvider({
      key: "pinecone",
      displayName: "Pinecone",
      validateConfiguration: (configuration) => validateAgainstSchema(pineconeSchema, configuration),
    }),
    qdrant: createStubVectorStoreProvider({
      key: "qdrant",
      displayName: "Qdrant",
      validateConfiguration: (configuration) => validateAgainstSchema(qdrantSchema, configuration),
    }),
    chroma: createStubVectorStoreProvider({
      key: "chroma",
      displayName: "Chroma",
      validateConfiguration: (configuration) => validateAgainstSchema(chromaSchema, configuration),
    }),
    azure_ai_search: createStubVectorStoreProvider({
      key: "azure_ai_search",
      displayName: "Azure AI Search",
      validateConfiguration: (configuration) => validateAgainstSchema(azureSchema, configuration),
    }),
  };
}

/** @deprecated Use createVectorStoreAdapters */
export const createStubVectorStoreAdapters = createVectorStoreAdapters;
