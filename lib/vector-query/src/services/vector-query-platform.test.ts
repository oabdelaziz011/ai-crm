import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KnowledgeEmbeddingNotFoundError,
  PermissionDeniedError,
} from "../errors.js";
import { clampScore, computeQueryChecksum } from "../utils/query-utils.js";
import { createContext, createTestEnvironment } from "./test-utils.js";

describe("VectorQueryManagementService", () => {
  it("executes the full query pipeline and returns DTO response", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    const outcome = await env.management.executeQuery(ctx, {
      companyId: "company-1",
      connectionId: "connection-1",
      collectionId: "collection-1",
      queryVector: [0.12, 0.34, 0.56, 0.78],
      metadataFilters: { document_type: "policy", company: "company-1" },
      correlationId: "corr-123",
    });

    assert.ok(outcome.executionId);
    assert.equal(outcome.correlationId, "corr-123");
    assert.ok(outcome.resultCount > 0);
    assert.ok(outcome.normalizedResults.length > 0);
    assert.equal(outcome.normalizedResults[0]?.ranking, 1);
    assert.ok(
      outcome.normalizedResults.every(
        (item) => item.normalizedScore >= 0 && item.normalizedScore <= 1,
      ),
    );
    assert.equal(env.telemetryEvents.length, 1);
    assert.equal(env.telemetryEvents[0]?.policyId, "policy-1");
  });

  it("supports embedding-based queries", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    const outcome = await env.management.executeQuery(ctx, {
      companyId: "company-1",
      connectionId: "connection-1",
      collectionId: "collection-1",
      embeddingId: "embedding-1",
    });

    assert.ok(outcome.executionId);
    assert.equal(outcome.resultCount, outcome.normalizedResults.length);
  });

  it("loads persisted executions as DTO responses", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    const outcome = await env.management.executeQuery(ctx, {
      companyId: "company-1",
      connectionId: "connection-1",
      collectionId: "collection-1",
      queryVector: [0.12, 0.34, 0.56, 0.78],
    });

    const loaded = await env.management.getExecution(ctx, outcome.executionId);
    assert.equal(loaded.response.executionId, outcome.executionId);
    assert.equal(loaded.response.resultCount, outcome.resultCount);
  });
});

describe("RBAC and isolation", () => {
  it("requires execute permission", async () => {
    const env = createTestEnvironment();
    const ctx = createContext({ hasPermission: (code) => code === "vectorquery.view" });

    await assert.rejects(
      () =>
        env.management.executeQuery(ctx, {
          companyId: "company-1",
          connectionId: "connection-1",
          collectionId: "collection-1",
          queryVector: [0.1, 0.2, 0.3, 0.4],
        }),
      PermissionDeniedError,
    );
  });

  it("rejects missing embeddings", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    await assert.rejects(
      () =>
        env.management.executeQuery(ctx, {
          companyId: "company-1",
          connectionId: "connection-1",
          collectionId: "collection-1",
          embeddingId: "missing",
        }),
      KnowledgeEmbeddingNotFoundError,
    );
  });
});

describe("Query utilities", () => {
  it("computes stable checksums and clamps scores", () => {
    const checksum = computeQueryChecksum({
      queryVector: [0.1, 0.2],
      collectionId: "collection-1",
      metadataFilters: { language: "en" },
    });
    assert.match(checksum, /^[a-f0-9]{64}$/);
    assert.equal(clampScore(1.5), 1);
    assert.equal(clampScore(-0.2), 0);
  });
});

describe("VectorQueryProviderRegistryService", () => {
  it("resolves providers only through the registry", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    const provider = await env.providerRegistry.resolveProviderInstance(ctx, env.connection);
    assert.equal(typeof provider.query, "function");
    assert.equal(typeof provider.supportedCapabilities, "function");
  });
});
