import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { InMemoryPgVectorStorage } from "@workspace/vector-store";
import { createPgVectorQueryAdapter } from "./pgvector-query-adapter.js";
import { createPgVectorStoreAdapter } from "@workspace/vector-store";

const companyId = "22222222-2222-4222-8222-222222222222";
const configuration = { schema: "public", tablePrefix: "vs_", companyId };

describe("PgVector query adapter", () => {
  it("returns ranked hits through the query provider contract", async () => {
    const storage = new InMemoryPgVectorStorage();
    const store = createPgVectorStoreAdapter(storage, configuration);
    const query = createPgVectorQueryAdapter(storage, configuration);

    await store.createCollection({ name: "enterprise-knowledge", dimensions: 4 });
    const targetId = randomUUID();
    await store.upsertVector({
      collectionName: "enterprise-knowledge",
      vectorId: targetId,
      vector: [0.12, 0.34, 0.56, 0.78],
      metadata: { document_type: "policy", company: "company-1" },
    });

    const result = await query.query({
      collectionName: "enterprise-knowledge",
      queryVector: [0.12, 0.34, 0.56, 0.78],
      topK: 3,
      metadataFilters: { document_type: "policy", company: "company-1" },
    });

    assert.equal(result.mock, false);
    assert.equal(result.hits.length, 1);
    assert.equal(result.hits[0]?.vectorId, targetId);
    assert.ok((result.hits[0]?.providerScore ?? 0) > 99);

    const statistics = await query.statistics({ collectionName: "enterprise-knowledge" });
    assert.equal(statistics.mock, false);
    assert.equal(statistics.indexedVectorCount, 1);
  });
});
