/**
 * ChannelSessionEngine — department ownership only on first conversation create.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelSessionEngine } from "../engines/channel-session-engine.ts";
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.ts";
import type {
  ChannelSessionRecord,
  ChannelSessionRepository,
} from "../repositories/channel-platform-repositories.ts";

function session(overrides: Partial<ChannelSessionRecord> = {}): ChannelSessionRecord {
  return {
    id: overrides.id ?? "sess-1",
    company_id: overrides.company_id ?? "company-1",
    company_channel_id: overrides.company_channel_id ?? "chan-1",
    conversation_id: overrides.conversation_id ?? "conv-existing",
    channel_key: overrides.channel_key ?? "email",
    external_thread_id: overrides.external_thread_id ?? "thread-1",
    sender_external_id: overrides.sender_external_id ?? "sender@example.com",
    session_status: overrides.session_status ?? "active",
    metadata: overrides.metadata ?? {},
    last_inbound_at: overrides.last_inbound_at ?? null,
    last_outbound_at: overrides.last_outbound_at ?? null,
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
  };
}

describe("ChannelSessionEngine department ownership (first-create-wins)", () => {
  it("7. later inbound reuses existing session without creating / overwriting ownership", async () => {
    const creates: Array<{ departmentId?: string | null }> = [];
    const repo: ChannelSessionRepository = {
      findByExternalThread: async () => session(),
      createSession: async () => {
        throw new Error("must not create session when existing");
      },
      reattachConversation: async () => session(),
      updateSessionMetadata: async () => session(),
      touchInbound: async () => session(),
      touchOutbound: async () => session(),
    };
    const ports = {
      conversation: {
        createConversation: async (input) => {
          creates.push({ departmentId: input.departmentId });
          return { id: "conv-new" };
        },
        addIncomingMessage: async () => ({
          id: "m1",
          conversationId: "c1",
          createdAt: new Date().toISOString(),
        }),
        addOutgoingMessage: async () => ({
          id: "m2",
          conversationId: "c1",
          createdAt: new Date().toISOString(),
        }),
      },
    } as unknown as ChannelPlatformPorts;

    const engine = new ChannelSessionEngine(repo, ports);
    const result = await engine.resolveSession(
      { userId: "u1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      {
        companyId: "company-1",
        companyChannelId: "chan-1",
        channelKey: "email",
        externalThreadId: "thread-1",
        departmentId: "dept-should-not-apply",
        metadata: { emailRoutingDecision: { targetType: "department", targetId: "dept-should-not-apply" } },
      },
    );

    assert.equal(result.conversation_id, "conv-existing");
    assert.equal(creates.length, 0);
  });

  it("15. new session create passes departmentId into shared createConversation", async () => {
    const creates: Array<{ departmentId?: string | null }> = [];
    const repo: ChannelSessionRepository = {
      findByExternalThread: async () => null,
      createSession: async (input) =>
        session({ id: "sess-new", conversation_id: input.conversationId }),
      reattachConversation: async () => session(),
      updateSessionMetadata: async () => session(),
      touchInbound: async () => session(),
      touchOutbound: async () => session(),
    };
    const ports = {
      conversation: {
        createConversation: async (input) => {
          creates.push({ departmentId: input.departmentId });
          return { id: "conv-new" };
        },
        addIncomingMessage: async () => ({
          id: "m1",
          conversationId: "c1",
          createdAt: new Date().toISOString(),
        }),
        addOutgoingMessage: async () => ({
          id: "m2",
          conversationId: "c1",
          createdAt: new Date().toISOString(),
        }),
      },
    } as unknown as ChannelPlatformPorts;

    const engine = new ChannelSessionEngine(repo, ports);
    await engine.resolveSession(
      { userId: "u1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      {
        companyId: "company-1",
        companyChannelId: "chan-1",
        channelKey: "email",
        externalThreadId: "thread-new",
        aiAssistantId: "asst-1",
        departmentId: "dept-a",
      },
    );

    assert.equal(creates.length, 1);
    assert.equal(creates[0]?.departmentId, "dept-a");
  });

  it("9. outbound-style create without departmentId stays null", async () => {
    const creates: Array<{ departmentId?: string | null }> = [];
    const repo: ChannelSessionRepository = {
      findByExternalThread: async () => null,
      createSession: async (input) =>
        session({ id: "sess-new", conversation_id: input.conversationId }),
      reattachConversation: async () => session(),
      updateSessionMetadata: async () => session(),
      touchInbound: async () => session(),
      touchOutbound: async () => session(),
    };
    const ports = {
      conversation: {
        createConversation: async (input) => {
          creates.push({ departmentId: input.departmentId ?? null });
          return { id: "conv-new" };
        },
        addIncomingMessage: async () => ({
          id: "m1",
          conversationId: "c1",
          createdAt: new Date().toISOString(),
        }),
        addOutgoingMessage: async () => ({
          id: "m2",
          conversationId: "c1",
          createdAt: new Date().toISOString(),
        }),
      },
    } as unknown as ChannelPlatformPorts;

    const engine = new ChannelSessionEngine(repo, ports);
    await engine.resolveSession(
      { userId: "u1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      {
        companyId: "company-1",
        companyChannelId: "chan-1",
        channelKey: "email",
        externalThreadId: "thread-compose",
        aiAssistantId: "asst-1",
        // outbound compose does not pass departmentId
      },
    );

    assert.equal(creates.length, 1);
    assert.equal(creates[0]?.departmentId, null);
  });
});
