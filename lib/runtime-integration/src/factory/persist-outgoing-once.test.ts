import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DuplicateExternalMessageError } from "@workspace/ai-conversation";
import { RuntimeDomainError } from "../errors.js";
import { assistantReplyExternalId, persistOutgoingOnce } from "./persist-outgoing-once.js";

describe("persist outgoing assistant reply once", () => {
  it("stores one reply and reuses it for the same inbound correlation", async () => {
    const stored = new Map<string, { id: string; content: string }>();
    let inserts = 0;
    const persist = () =>
      persistOutgoingOnce({
        correlationId: "inbound-1",
        insert: async (externalMessageId) => {
          inserts += 1;
          if (!externalMessageId) throw new Error("missing external id");
          if (stored.has(externalMessageId)) throw new DuplicateExternalMessageError(externalMessageId);
          const message = { id: "msg-1", content: "A draft quote was saved. It was not sent." };
          stored.set(externalMessageId, message);
          return message;
        },
        findExisting: async (externalMessageId) => stored.get(externalMessageId) ?? null,
      });

    const first = await persist();
    const replay = await persist();
    const secondReplay = await persist();

    assert.equal(assistantReplyExternalId("inbound-1"), "assistant-reply:inbound-1");
    assert.equal(inserts, 3);
    assert.equal(stored.size, 1);
    assert.equal(first.reused, false);
    assert.equal(replay.reused, true);
    assert.equal(secondReplay.reused, true);
    assert.equal(first.message.id, replay.message.id);
    assert.equal(secondReplay.message.id, "msg-1");
  });

  it("reports a persistence failure separately from a provider error", async () => {
    await assert.rejects(
      () =>
        persistOutgoingOnce({
          correlationId: "inbound-2",
          insert: async () => {
            throw new Error("provider_rate_limit_exceeded");
          },
          findExisting: async () => null,
        }),
      (error: unknown) => {
        assert.ok(error instanceof RuntimeDomainError);
        assert.equal(error.code, "PERSISTENCE_FAILED");
        assert.equal(error.category, "persistence");
        assert.equal(error.humanMessage.includes("provider_rate_limit_exceeded"), false);
        assert.match(error.humanMessage, /could not be saved/i);
        return true;
      },
    );
  });
});
