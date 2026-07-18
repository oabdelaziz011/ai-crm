import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { InMemoryPgVectorStorage } from "./pgvector-storage.js";
import { createPgVectorStoreAdapter } from "./pgvector-store-adapter.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const configuration = { schema: "public", tablePrefix: "vs_", companyId };

describe("PgVector store adapter", () => {
  it("persists vectors and supports nearest-neighbor search with metadata filtering", async () => {
    const storage = new InMemoryPgVectorStorage();
    const store = createPgVectorStoreAdapter(storage, configuration);

    await store.createCollection({ name: "docs", dimensions: 4, metadata: { domain: "knowledge" } });

    const vectorA = randomUUID();
    const vectorB = randomUUID();
    const vectorC = randomUUID();

    await store.upsertVector({
      collectionName: "docs",
      vectorId: vectorA,
      vector: [1, 0, 0, 0],
      metadata: { document_type: "policy", language: "en" },
    });
    await store.upsertVector({
      collectionName: "docs",
      vectorId: vectorB,
      vector: [0.9, 0.1, 0, 0],
      metadata: { document_type: "policy", language: "en" },
    });
    await store.upsertVector({
      collectionName: "docs",
      vectorId: vectorC,
      vector: [0, 1, 0, 0],
      metadata: { document_type: "faq", language: "en" },
    });

    const stats = await store.collectionStatistics({ collectionName: "docs" });
    assert.equal(stats.vectorCount, 3);
    assert.equal(stats.dimensions, 4);
    assert.equal(stats.mock, false);

    const hits = await storage.similaritySearch({
      companyId,
      collectionName: "docs",
      queryVector: [1, 0, 0, 0],
      topK: 2,
      metadataFilter: { document_type: "policy" },
    });

    assert.equal(hits.length, 2);
    assert.equal(hits[0]?.vectorId, vectorA);
    assert.ok((hits[0]?.providerScore ?? 0) >= (hits[1]?.providerScore ?? 0));

    await store.deleteVector({ collectionName: "docs", vectorId: vectorA });
    const afterDelete = await store.collectionStatistics({ collectionName: "docs" });
    assert.equal(afterDelete.vectorCount, 2);

    await store.deleteCollection({ name: "docs" });
    const afterCollectionDelete = await store.collectionStatistics({ collectionName: "docs" });
    assert.equal(afterCollectionDelete.vectorCount, 0);
  });

  it("rejects vectors with mismatched dimensions", async () => {
    const storage = new InMemoryPgVectorStorage();
    const store = createPgVectorStoreAdapter(storage, configuration);

    await store.createCollection({ name: "strict", dimensions: 4 });

    await assert.rejects(
      () =>
        store.upsertVector({
          collectionName: "strict",
          vectorId: randomUUID(),
          vector: [0.1, 0.2, 0.3],
        }),
      /dimensions/i,
    );
  });
});
