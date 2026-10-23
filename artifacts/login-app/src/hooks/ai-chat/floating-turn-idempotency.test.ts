import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveFloatingTurnIdempotencyKey } from "./floating-turn-idempotency.ts";

describe("floating turn idempotency", () => {
  it("reuses the key for the same failed text and starts a new key after success or reload", () => {
    let seq = 0;
    const createKey = () => `floating:conv:${++seq}`;
    const first = resolveFloatingTurnIdempotencyKey({
      conversationId: "conv",
      text: "Please prepare a quote",
      previousFailedTurn: null,
      createKey,
    });
    const retry = resolveFloatingTurnIdempotencyKey({
      conversationId: "conv",
      text: "Please prepare a quote",
      previousFailedTurn: { conversationId: "conv", text: "Please prepare a quote", key: first },
      createKey,
    });
    const otherText = resolveFloatingTurnIdempotencyKey({
      conversationId: "conv",
      text: "A different request",
      previousFailedTurn: { conversationId: "conv", text: "Please prepare a quote", key: first },
      createKey,
    });
    const afterReload = resolveFloatingTurnIdempotencyKey({
      conversationId: "conv",
      text: "Please prepare a quote",
      previousFailedTurn: null,
      createKey,
    });

    assert.equal(retry, first);
    assert.notEqual(otherText, first);
    assert.notEqual(afterReload, first);
    assert.equal(seq, 3);
  });
});
