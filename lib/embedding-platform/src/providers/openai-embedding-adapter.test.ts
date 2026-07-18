import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EmbeddingProviderRequestError,
  EmbeddingProviderTimeoutError,
} from "../errors.js";
import { createOpenAIEmbeddingAdapter } from "./openai-embedding-adapter.js";
import { fetchWithRetry } from "./http/retry-client.js";

function createMockFetch(response: {
  ok?: boolean;
  status?: number;
  body?: unknown;
}) {
  return async () =>
    ({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      text: async () => JSON.stringify(response.body ?? {}),
      json: async () => response.body ?? {},
    }) as Response;
}

describe("fetchWithRetry", () => {
  it("retries retryable HTTP statuses", async () => {
    let attempts = 0;
    const fetchFn = async () => {
      attempts += 1;
      if (attempts < 3) {
        return { ok: false, status: 429, text: async () => "rate limited" } as Response;
      }
      return { ok: true, status: 200, text: async () => "ok", json: async () => ({ ok: true }) } as Response;
    };

    const response = await fetchWithRetry(
      "https://example.test/embeddings",
      { method: "POST" },
      { timeoutMs: 1000, maxRetries: 3, baseDelayMs: 1, fetchFn },
    );
    assert.equal(response.ok, true);
    assert.equal(attempts, 3);
  });

  it("throws timeout errors when the request aborts", async () => {
    const fetchFn = async (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      });

    await assert.rejects(
      () =>
        fetchWithRetry(
          "https://example.test/embeddings",
          { method: "POST" },
          { timeoutMs: 20, maxRetries: 0, fetchFn },
        ),
      EmbeddingProviderTimeoutError,
    );
  });

  it("throws request errors for non-retryable HTTP statuses", async () => {
    const fetchFn = createMockFetch({ ok: false, status: 401, body: { error: "invalid key" } });
    await assert.rejects(
      () =>
        fetchWithRetry(
          "https://example.test/embeddings",
          { method: "POST" },
          { timeoutMs: 1000, maxRetries: 0, fetchFn },
        ),
      EmbeddingProviderRequestError,
    );
  });
});

describe("OpenAIEmbeddingAdapter", () => {
  const configuration = {
    model: "text-embedding-3-small",
    dimensions: 4,
    apiKey: "test-key",
    timeoutMs: 1000,
    maxRetries: 1,
  };

  it("generates a real (non-mock) embedding vector", async () => {
    const fetchFn = createMockFetch({
      body: {
        model: "text-embedding-3-small",
        data: [{ index: 0, embedding: [0.11, 0.22, 0.33, 0.44] }],
        usage: { total_tokens: 7 },
      },
    });

    const adapter = createOpenAIEmbeddingAdapter(configuration, { fetchFn });
    const result = await adapter.generateEmbedding({ text: "hello world" });

    assert.equal(result.mock, false);
    assert.deepEqual(result.vector, [0.11, 0.22, 0.33, 0.44]);
    assert.equal(result.dimensions, 4);
    assert.equal(result.tokenCount, 7);
  });

  it("supports batch embedding generation", async () => {
    const fetchFn = createMockFetch({
      body: {
        model: "text-embedding-3-small",
        data: [
          { index: 0, embedding: [0.1, 0.2, 0.3, 0.4] },
          { index: 1, embedding: [0.5, 0.6, 0.7, 0.8] },
        ],
      },
    });

    const adapter = createOpenAIEmbeddingAdapter(configuration, { fetchFn });
    const result = await adapter.generateEmbeddingsBatch({
      items: [{ text: "one" }, { text: "two" }],
    });

    assert.equal(result.results.length, 2);
    assert.equal(result.mock, false);
    assert.deepEqual(result.results[0]?.vector, [0.1, 0.2, 0.3, 0.4]);
    assert.deepEqual(result.results[1]?.vector, [0.5, 0.6, 0.7, 0.8]);
  });

  it("requires an API key", async () => {
    const adapter = createOpenAIEmbeddingAdapter(
      { model: "text-embedding-3-small", dimensions: 4 },
      {
        fetchFn: createMockFetch({ body: { data: [{ index: 0, embedding: [1, 2, 3, 4] }] } }),
        apiKeyEnvVar: "MISSING_OPENAI_KEY_FOR_TEST",
      },
    );

    await assert.rejects(() => adapter.generateEmbedding({ text: "hello" }), /API key is required/);
  });
});
