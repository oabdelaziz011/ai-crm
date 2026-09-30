import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createInMemoryWebChatRateLimitStore,
  createSupabaseWebChatRateLimitStore,
  WebChatRateLimitStoreError,
} from "./public-web-chat-rate-limit.js";

describe("Public Web Chat rate-limit store abstraction", () => {
  it("supabase wrapper is kind=shared and maps RPC json", async () => {
    const calls: unknown[] = [];
    const store = createSupabaseWebChatRateLimitStore(
      {
        rpc: async (fn, args) => {
          calls.push({ fn, args });
          return { data: { allowed: false, retry_after_seconds: 7 }, error: null };
        },
      } as never,
      { keyPrefix: "t:" },
    );
    assert.equal(store.kind, "shared");
    const decision = await store.consume("ip:1", 10, 60_000);
    assert.equal(decision.allowed, false);
    assert.equal(decision.retryAfterSeconds, 7);
    assert.deepEqual(calls[0], {
      fn: "web_chat_rate_limit_consume",
      args: { p_bucket_key: "t:ip:1", p_limit: 10, p_window_ms: 60_000 },
    });
  });

  it("supabase wrapper fail-closes by throwing on RPC error", async () => {
    const store = createSupabaseWebChatRateLimitStore({
      rpc: async () => ({ data: null, error: { message: "db down" } }),
    } as never);
    await assert.rejects(() => store.consume("k", 1, 1000), WebChatRateLimitStoreError);
  });

  it("in-memory concurrent consumers on one key still enforce the limit", async () => {
    const store = createInMemoryWebChatRateLimitStore();
    const results = await Promise.all(Array.from({ length: 20 }, () => store.consume("race", 10, 60_000)));
    assert.equal(results.filter((r) => r.allowed).length, 10);
    assert.equal(results.filter((r) => !r.allowed).length, 10);
  });
});
