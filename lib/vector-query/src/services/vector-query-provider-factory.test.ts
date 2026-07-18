import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultVectorQueryProviderFactory } from "../factory/vector-query-provider-factory.js";
import type { VectorStoreDefinitionReader } from "../repositories/vector-query-repositories.js";

const definitionReader: VectorStoreDefinitionReader = {
  findByKey: async (key) => ({
    key,
    default_configuration: { schema: "public", tablePrefix: "vs_" },
    configuration_schema: {
      type: "object",
      properties: { schema: { type: "string" } },
      required: ["schema"],
    },
    is_active: true,
  }),
};

describe("VectorQueryProviderFactory", () => {
  it("exposes query contract without retrieval methods", async () => {
    const factory = createDefaultVectorQueryProviderFactory(definitionReader);
    const provider = await factory.resolve({
      providerKey: "pinecone",
      configuration: { environment: "us-east-1", indexName: "vaultos-index" },
    });

    assert.deepEqual(provider.supportedCapabilities(), [
      "similarity_query",
      "metadata_filter",
      "collection_statistics",
    ]);

    const result = await provider.query({
      collectionName: "enterprise-knowledge",
      queryVector: [0.12, 0.34, 0.56, 0.78],
      topK: 3,
      metadataFilters: { language: "en" },
    });

    assert.equal(result.mock, true);
    assert.ok(result.hits.length > 0);
    assert.equal("search" in provider, false);
    assert.equal("retrieve" in provider, false);
  });

  it("lists supported provider keys", () => {
    const factory = createDefaultVectorQueryProviderFactory(definitionReader);
    const keys = factory.getSupportedProviderKeys();
    assert.ok(keys.includes("pgvector"));
    assert.ok(keys.includes("pinecone"));
  });
});
