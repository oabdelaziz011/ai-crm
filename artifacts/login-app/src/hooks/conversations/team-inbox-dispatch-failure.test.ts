import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { ProviderAcceptanceUnconfirmedError } from "@workspace/channel-platform/client";
import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import { persistTeamInboxDispatchFailure } from "./team-inbox-dispatch-failure.ts";

const hookSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "use-team-inbox-reply.ts"), "utf8");

function message(id: string): ConversationMessageRecord {
  return {
    id,
    status: "dispatching",
    metadata: { outboundPhase: "dispatching" },
  } as ConversationMessageRecord;
}

describe("team inbox unconfirmed dispatch", () => {
  it("delegates failure persistence and does not send again from the hook", () => {
    assert.match(hookSource, /persistTeamInboxDispatchFailure\(/);
    assert.doesNotMatch(hookSource, /confirm_conversation_message_outbound/);
    assert.doesNotMatch(hookSource, /sendOutbound\(/);
  });

  it("does not confirm failed or rewrite the message when acceptance is unconfirmed", async () => {
    const rpcCalls: string[] = [];
    const sends: string[] = [];
    let stored = [message("msg-real")];
    const result = await persistTeamInboxDispatchFailure({
      error: new ProviderAcceptanceUnconfirmedError("provider accepted but local delivery update failed"),
      optimisticId: "msg-real",
      mode: "reply",
      queryKey: ["conversation-messages", "conv-1"],
      supabase: {
        async rpc(fn) {
          rpcCalls.push(fn);
          return { error: null };
        },
      },
      queryClient: {
        setQueryData(_key, updater) {
          stored = updater(stored);
        },
      },
      patchMessage: (current, patch) => ({ ...current, ...patch }),
    });

    assert.equal(result.acceptanceUnconfirmed, true);
    assert.equal(result.confirmedFailed, false);
    assert.deepEqual(rpcCalls, []);
    assert.deepEqual(sends, []);
    assert.equal(stored[0]?.status, "dispatching");
  });

  it("still confirms failed for a proven pre-accept dispatch error", async () => {
    const rpcCalls: Array<{ status: string }> = [];
    let stored = [message("msg-real")];
    const result = await persistTeamInboxDispatchFailure({
      error: new Error("commercial access denied"),
      optimisticId: "msg-real",
      mode: "reply",
      queryKey: ["conversation-messages", "conv-1"],
      supabase: {
        async rpc(_fn, args) {
          rpcCalls.push({ status: args.p_status });
          return { error: null };
        },
      },
      queryClient: {
        setQueryData(_key, updater) {
          stored = updater(stored);
        },
      },
      patchMessage: (current, patch) => ({ ...current, ...patch, metadata: { ...current.metadata, ...patch.metadata } }),
    });

    assert.equal(result.confirmedFailed, true);
    assert.deepEqual(rpcCalls, [{ status: "failed" }]);
    assert.equal(stored[0]?.status, "failed");
  });
});
