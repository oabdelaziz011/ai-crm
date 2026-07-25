import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dispatchAutomationOutboundMessages } from "./dispatch-automation-outbound.js";
import type { ChannelConversationPort, ChannelDispatcherPort } from "../ports/channel-platform-ports.js";
import type { ServiceContext } from "../types.js";

describe("dispatchAutomationOutboundMessages", () => {
  it("persists each outbound message before dispatching with outboundMessageId", async () => {
    const dispatched: Array<{ text: string; outboundMessageId?: string; persistConversationMessage?: boolean }> = [];
    const persisted: string[] = [];

    const conversation: ChannelConversationPort = {
      createConversation: async () => ({ id: "conv-1" }),
      addIncomingMessage: async (input) => ({
        id: "msg-in-1",
        conversationId: input.conversationId,
        messageType: "incoming",
        content: input.content,
        createdAt: new Date().toISOString(),
      }),
      addOutgoingMessage: async (input) => {
        persisted.push(input.content);
        return {
          id: `msg-out-${persisted.length}`,
          conversationId: input.conversationId,
          messageType: "outgoing",
          content: input.content,
          createdAt: new Date().toISOString(),
        };
      },
    };

    const dispatcher: ChannelDispatcherPort = {
      async dispatch(_ctx, request) {
        dispatched.push({
          text: request.text,
          outboundMessageId: request.outboundMessageId,
          persistConversationMessage: request.persistConversationMessage,
        });
        return { deliveryEventId: `delivery-${dispatched.length}`, deliveryStatus: "sent" };
      },
    };

    const result = await dispatchAutomationOutboundMessages(
      { isSuperAdmin: true } as ServiceContext,
      dispatcher,
      conversation,
      {
        companyId: "company-1",
        companyChannelId: "channel-1",
        channelKey: "telegram",
        conversationId: "conv-1",
        channelSessionId: "session-1",
        externalThreadId: "user-1",
        automationRunId: "run-1",
        correlationId: "corr-1",
        messages: [
          { text: "First", payload: { kind: "text", text: "First" } },
          { text: "Second", payload: { kind: "text", text: "Second" } },
        ],
      },
    );

    assert.deepEqual(persisted, ["First", "Second"]);
    assert.deepEqual(
      dispatched.map((entry) => entry.text),
      ["First", "Second"],
    );
    assert.deepEqual(result.outboundMessageIds, ["msg-out-1", "msg-out-2"]);
    assert.equal(result.deliveryEventIds.length, 2);
    assert.equal(result.responseContent, "Second");
    for (const [index, entry] of dispatched.entries()) {
      assert.equal(entry.outboundMessageId, `msg-out-${index + 1}`);
      assert.equal(entry.persistConversationMessage, false);
    }
  });

  it("preserves automation metadata on persist and dispatch", async () => {
    let persistedMetadata: Record<string, unknown> | undefined;
    let dispatchedMetadata: Record<string, unknown> | undefined;

    const conversation: ChannelConversationPort = {
      createConversation: async () => ({ id: "conv-1" }),
      addIncomingMessage: async (input) => ({
        id: "msg-in-1",
        conversationId: input.conversationId,
        messageType: "incoming",
        content: input.content,
        createdAt: new Date().toISOString(),
      }),
      addOutgoingMessage: async (input) => {
        persistedMetadata = input.metadata;
        return {
          id: "msg-out-1",
          conversationId: input.conversationId,
          messageType: "outgoing",
          content: input.content,
          createdAt: new Date().toISOString(),
        };
      },
    };

    const dispatcher: ChannelDispatcherPort = {
      async dispatch(_ctx, request) {
        dispatchedMetadata = request.metadata;
        return { deliveryEventId: "delivery-1", deliveryStatus: "sent" };
      },
    };

    await dispatchAutomationOutboundMessages(
      { isSuperAdmin: true } as ServiceContext,
      dispatcher,
      conversation,
      {
        companyId: "company-1",
        companyChannelId: "channel-1",
        channelKey: "whatsapp",
        conversationId: "conv-1",
        channelSessionId: "session-1",
        externalThreadId: "user-1",
        automationRunId: "run-abc",
        correlationId: "corr-xyz",
        messages: [{ text: "Hello", payload: { kind: "text", text: "Hello" } }],
      },
    );

    assert.deepEqual(persistedMetadata, {
      automationRunId: "run-abc",
      correlationId: "corr-xyz",
      outboundPayload: { kind: "text", text: "Hello" },
    });
    assert.deepEqual(dispatchedMetadata, persistedMetadata);
  });
});
