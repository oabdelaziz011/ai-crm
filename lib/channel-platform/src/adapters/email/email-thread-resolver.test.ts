import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveEmailThread } from "./email-thread-resolver.js";

describe("resolveEmailThread", () => {
  it("prefers in-reply-to before creating a new thread", async () => {
    const result = await resolveEmailThread({
      messageId: "new-message-id",
      inReplyTo: "parent-message-id",
      references: [],
      fromEmail: "customer@example.com",
      companyChannelId: "cc-1",
      lookup: {
        async findByExternalMessageId(_companyChannelId, externalMessageId) {
          if (externalMessageId === "parent-message-id") {
            return { conversationId: "conv-1", externalThreadId: "thread-root-id" };
          }
          return null;
        },
      },
    });

    assert.equal(result.externalThreadId, "thread-root-id");
    assert.equal(result.matchedBy, "in_reply_to");
  });

  it("falls back to references when in-reply-to is missing", async () => {
    const result = await resolveEmailThread({
      messageId: "new-message-id",
      references: ["ignored-id", "thread-root-id"],
      fromEmail: "customer@example.com",
      companyChannelId: "cc-1",
      lookup: {
        async findByExternalMessageId(_companyChannelId, externalMessageId) {
          if (externalMessageId === "thread-root-id") {
            return { conversationId: "conv-1", externalThreadId: "thread-root-id" };
          }
          return null;
        },
      },
    });

    assert.equal(result.externalThreadId, "thread-root-id");
    assert.equal(result.matchedBy, "references");
  });

  it("creates a new thread from message id when no prior match exists", async () => {
    const result = await resolveEmailThread({
      messageId: "<abc@example.com>",
      fromEmail: "customer@example.com",
      companyChannelId: "cc-1",
      lookup: {
        async findByExternalMessageId() {
          return null;
        },
      },
    });

    assert.equal(result.externalThreadId, "abc@example.com");
    assert.equal(result.matchedBy, "new_thread");
  });
});
