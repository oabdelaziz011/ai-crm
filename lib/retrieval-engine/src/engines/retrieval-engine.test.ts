import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PermissionDeniedError,
  VectorQueryExecutionNotFoundError,
  VectorQueryExecutionNotReadyError,
} from "../errors.js";
import { computeContextChecksum } from "../utils/retrieval-utils.js";
import { createContext, createTestEnvironment } from "./test-utils.js";

describe("RetrievalEngine pipeline", () => {
  it("executes the full retrieval pipeline and returns DTO response", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    const response = await env.retrieval.retrieve(ctx, {
      companyId: "company-1",
      vectorQueryExecutionId: "vq-exec-1",
      correlationId: "corr-retrieval-1",
    });

    assert.ok(response.executionId);
    assert.equal(response.correlationId, "corr-retrieval-1");
    assert.ok(response.context.chunks.length > 0);
    assert.ok(response.metrics.chunksSelected > 0);
    assert.equal(env.executions.length, 1);
    assert.equal(env.contexts.length, 1);
    assert.equal(env.metricsRecords.length, 1);
    assert.equal(env.telemetryEvents.length, 1);
  });

  it("requires execute permission", async () => {
    const env = createTestEnvironment();
    const ctx = createContext({ hasPermission: (code) => code === "retrieval.view" });

    await assert.rejects(
      () =>
        env.retrieval.retrieve(ctx, {
          companyId: "company-1",
          vectorQueryExecutionId: "vq-exec-1",
        }),
      PermissionDeniedError,
    );
  });

  it("rejects missing vector query executions", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    await assert.rejects(
      () =>
        env.retrieval.retrieve(ctx, {
          companyId: "company-1",
          vectorQueryExecutionId: "missing",
        }),
      VectorQueryExecutionNotFoundError,
    );
  });

  it("rejects incomplete vector query executions", async () => {
    const env = createTestEnvironment();
    env.vectorExecution.executionStatus = "running";
    const ctx = createContext();

    await assert.rejects(
      () =>
        env.retrieval.retrieve(ctx, {
          companyId: "company-1",
          vectorQueryExecutionId: "vq-exec-1",
        }),
      VectorQueryExecutionNotReadyError,
    );
  });
});

describe("Retrieval utilities", () => {
  it("computes stable context checksums", () => {
    const checksum = computeContextChecksum([
      { knowledgeChunkId: "chunk-1", content: "hello world" },
    ]);
    assert.match(checksum, /^[a-f0-9]{64}$/);
  });
});
