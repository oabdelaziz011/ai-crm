import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChannelConversationPort, ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { ChannelSessionRepository } from "../repositories/channel-platform-repositories.js";
import { ChannelSessionEngine } from "./channel-session-engine.js";

function createEngine(options?: {
  assistantId?: string | null;
  resolveCompanyAssistantId?: ChannelConversationPort["resolveCompanyAssistantId"];
}) {
  const sessions: Array<{ id: string; conversation_id: string }> = [];

  const sessionRepository: ChannelSessionRepository = {
    findByExternalThread: async () => null,
    createSession: async (input) => {
      const record = {
        id: `session-${sessions.length + 1}`,
        company_id: input.companyId,
        company_channel_id: input.companyChannelId,
        channel_key: input.channelKey,
        conversation_id: input.conversationId,
        external_thread_id: input.externalThreadId,
        sender_external_id: input.senderExternalId ?? null,
        metadata: input.metadata ?? {},
        inbound_count: 0,
        outbound_count: 0,
        last_inbound_at: null,
        last_outbound_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      sessions.push(record);
      return record;
    },
    reattachConversation: async (sessionId, conversationId) => {
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) throw new Error("session not found");
      session.conversation_id = conversationId;
      return {
        id: session.id,
        company_id: "company-1",
        company_channel_id: "channel-1",
        channel_key: "whatsapp",
        conversation_id: conversationId,
        external_thread_id: "thread-1",
        sender_external_id: null,
        metadata: {},
        inbound_count: 0,
        outbound_count: 0,
        last_inbound_at: null,
        last_outbound_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },
    touchInbound: async (sessionId) => {
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) throw new Error("session not found");
      return {
        id: session.id,
        company_id: "company-1",
        company_channel_id: "channel-1",
        channel_key: "whatsapp",
        conversation_id: session.conversation_id,
        external_thread_id: "thread-1",
        sender_external_id: null,
        metadata: {},
        inbound_count: 1,
        outbound_count: 0,
        last_inbound_at: new Date().toISOString(),
        last_outbound_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },
    touchOutbound: async () => {
      throw new Error("not implemented");
    },
  };

  const ports: ChannelPlatformPorts = {
    registry: {
      getCompanyChannel: async () => null,
      findCompanyChannelByPhoneNumberId: async () => [],
      findCompanyChannelsByWhatsAppVerifyToken: async () => [],
    },
    conversation: {
      resolveCompanyAssistantId: options?.resolveCompanyAssistantId,
      createConversation: async (input) => {
        if (options?.assistantId === null) {
          throw new Error("createConversation should not be called without assistant id");
        }
        return { id: "conv-1" };
      },
      addIncomingMessage: async () => ({
        id: "msg-1",
        conversationId: "conv-1",
        messageType: "incoming",
        content: "hello",
        createdAt: new Date().toISOString(),
      }),
      addOutgoingMessage: async () => ({
        id: "msg-2",
        conversationId: "conv-1",
        messageType: "outgoing",
        content: "hello",
        createdAt: new Date().toISOString(),
      }),
    },
    runtime: {
      execute: async () => ({
        executionId: "exec-1",
        responseContent: "ok",
        correlationId: "corr-1",
      }),
    },
  };

  return {
    engine: new ChannelSessionEngine(sessionRepository, ports),
    sessions,
  };
}

describe("ChannelSessionEngine", () => {
  it("requires aiAssistantId for AI sessions by default", async () => {
    const { engine } = createEngine();

    await assert.rejects(
      () =>
        engine.resolveSession(
          { userId: null, companyId: "company-1", isSuperAdmin: true, hasPermission: () => true },
          {
            companyId: "company-1",
            companyChannelId: "channel-1",
            channelKey: "whatsapp",
            externalThreadId: "thread-1",
          },
        ),
      /aiAssistantId is required when creating a new channel session/,
    );
  });

  it("resolves company assistant for workflow sessions without request aiAssistantId", async () => {
    const { engine, sessions } = createEngine({
      resolveCompanyAssistantId: async () => "assistant-from-company",
    });

    const session = await engine.resolveSession(
      { userId: null, companyId: "company-1", isSuperAdmin: true, hasPermission: () => true },
      {
        companyId: "company-1",
        companyChannelId: "channel-1",
        channelKey: "whatsapp",
        externalThreadId: "thread-workflow",
        requireAiAssistant: false,
      },
    );

    assert.equal(session.conversation_id, "conv-1");
    assert.equal(sessions.length, 1);
  });
});
