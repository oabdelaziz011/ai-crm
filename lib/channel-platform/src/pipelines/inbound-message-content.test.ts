import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedInboundMessageDto } from "../dto/channel-dto.js";
import {
  hasValidInboundContent,
  isInteractiveInboundReply,
  resolveInboundMessageText,
} from "./inbound-message-content.js";

function normalized(partial: Partial<NormalizedInboundMessageDto>): NormalizedInboundMessageDto {
  return {
    externalThreadId: "15551234567",
    externalMessageId: "wamid.1",
    senderExternalId: "15551234567",
    text: "",
    attachments: [],
    ...partial,
  };
}

describe("inbound message content", () => {
  it("accepts plain text messages", () => {
    const message = normalized({ text: "Hello" });
    assert.equal(hasValidInboundContent(message), true);
    assert.equal(resolveInboundMessageText(message), "Hello");
  });

  it("accepts interactive list replies without text.body", () => {
    const message = normalized({
      metadata: {
        kind: "interactive_reply",
        replyId: "dr3",
        title: "Dr Three",
        interactionType: "list_reply",
      },
    });

    assert.equal(isInteractiveInboundReply(message.metadata), true);
    assert.equal(hasValidInboundContent(message), true);
    assert.equal(resolveInboundMessageText(message), "Dr Three");
  });

  it("accepts interactive replies identified by replyId only", () => {
    const message = normalized({
      metadata: {
        replyId: "dr3",
        interactionType: "list_reply",
      },
    });

    assert.equal(hasValidInboundContent(message), true);
    assert.equal(resolveInboundMessageText(message), "dr3");
  });

  it("accepts media-only inbound messages", () => {
    const message = normalized({
      attachments: [{ attachmentId: "media-1", type: "image" }],
    });

    assert.equal(hasValidInboundContent(message), true);
  });

  it("rejects empty plain-text messages", () => {
    const message = normalized({});
    assert.equal(hasValidInboundContent(message), false);
  });
});
