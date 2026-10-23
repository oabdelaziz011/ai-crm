import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assistantReplyExternalId,
  shouldRepairMissingWebChatReply,
  shouldSkipDuplicateInbound,
} from "./inbound-message-pipeline.js";

describe("web chat assistant reply recovery", () => {
  it("repairs a failed web chat turn only when the assistant reply is missing", () => {
    assert.equal(assistantReplyExternalId("event-1"), "assistant-reply:event-1");
    assert.equal(
      shouldRepairMissingWebChatReply({
        channelKey: "web_chat",
        processingStatus: "failed",
        assistantReplyStored: false,
      }),
      true,
    );
    assert.equal(
      shouldRepairMissingWebChatReply({
        channelKey: "web_chat",
        processingStatus: "failed",
        assistantReplyStored: true,
      }),
      false,
    );
    assert.equal(
      shouldRepairMissingWebChatReply({
        channelKey: "whatsapp",
        processingStatus: "failed",
        assistantReplyStored: false,
      }),
      false,
    );
    assert.equal(
      shouldSkipDuplicateInbound({
        processing_status: "failed",
        runtime_execution_id: "runtime-1",
      }),
      true,
    );
  });
});
