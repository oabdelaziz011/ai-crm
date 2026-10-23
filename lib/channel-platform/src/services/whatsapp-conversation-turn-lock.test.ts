import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChannelAdapterPort } from "../ports/channel-adapter-port.js";
import { createContext, createTestEnvironment } from "../test-utils.js";
import {
  createMemoryWhatsAppConversationTurnLock,
  createSupabaseWhatsAppConversationTurnLock,
  openWhatsAppSharedTurnLock,
} from "./whatsapp-conversation-turn-lock.js";

describe("whatsapp conversation turn lock", () => {
  it("renews and releases only for the current memory owner", async () => {
    const lock = createMemoryWhatsAppConversationTurnLock();
    const conversationId = "conv-memory";
    assert.equal(await lock.acquire({ conversationId, owner: "owner-aaaa", ttlMs: 1_000 }), true);
    assert.equal(await lock.acquire({ conversationId, owner: "owner-bbbb", ttlMs: 1_000 }), false);
    assert.equal(await lock.renew({ conversationId, owner: "owner-bbbb", ttlMs: 1_000 }), false);
    assert.equal(await lock.release({ conversationId, owner: "owner-bbbb" }), false);
    assert.equal(await lock.renew({ conversationId, owner: "owner-aaaa", ttlMs: 1_000 }), true);
    assert.equal(await lock.release({ conversationId, owner: "owner-aaaa" }), true);
    assert.equal(await lock.acquire({ conversationId, owner: "owner-bbbb", ttlMs: 1_000 }), true);
    await lock.release({ conversationId, owner: "owner-bbbb" });
  });

  it("treats a Postgres RPC error as not owned", async () => {
    const lock = createSupabaseWhatsAppConversationTurnLock({
      rpc: async () => ({ data: null, error: { message: "db down" } }),
    });
    await assert.rejects(
      () => lock.acquire({ conversationId: "00000000-0000-4000-8000-000000000001", owner: "owner-aaaa", ttlMs: 1_000 }),
      /conversation_turn_lock_unavailable/,
    );
    await assert.rejects(
      () => openWhatsAppSharedTurnLock(lock, "00000000-0000-4000-8000-000000000001", 1_000),
      /conversation_turn_lock_unavailable/,
    );
    const unconfirmed = createSupabaseWhatsAppConversationTurnLock({
      rpc: async () => ({ data: null, error: null }),
    });
    await assert.rejects(
      () => unconfirmed.acquire({ conversationId: "00000000-0000-4000-8000-000000000001", owner: "owner-aaaa", ttlMs: 1_000 }),
      /conversation_turn_lock_unavailable/,
    );
  });
});

class CountingWhatsAppAdapter implements ChannelAdapterPort {
  readonly channelKey = "whatsapp";
  sendCalls = 0;

  parseWebhook(): never {
    throw new Error("not used");
  }

  normalizeInbound(_ctx: unknown, payload: Record<string, unknown>) {
    return {
      externalThreadId: String(payload.externalThreadId ?? "201000000001"),
      externalMessageId: String(payload.externalMessageId ?? "wamid.in"),
      senderExternalId: "201000000001",
      text: String(payload.text ?? ""),
      attachments: [],
      metadata: {},
    };
  }

  formatOutbound(_ctx: unknown, message: { externalThreadId: string; text: string }) {
    return { to: message.externalThreadId, text: message.text };
  }

  async sendOutbound() {
    this.sendCalls += 1;
    return { externalMessageId: "wamid.out", providerResponse: { fake: true } };
  }
}

describe("inbound pipeline shared turn lock", () => {
  it("does not run AI or send when the shared lock cannot be confirmed", async () => {
    const adapter = new CountingWhatsAppAdapter();
    const env = createTestEnvironment({
      adapters: [adapter],
      companyChannel: { channelKey: "whatsapp", provider: "fake" },
      sharedTurnLock: {
        acquire: async () => {
          throw new Error("conversation_turn_lock_unavailable");
        },
        renew: async () => false,
        release: async () => false,
      },
    });

    await assert.rejects(
      () =>
        env.router.routeInbound(createContext(), {
          companyId: "company-1",
          companyChannelId: "company-channel-1",
          channelKey: "whatsapp",
          source: "webhook",
          idempotencyKey: "wamid.lock-down",
          externalThreadId: "201000000001",
          externalMessageId: "wamid.lock-down",
          payload: {
            text: "عايز احجز",
            externalThreadId: "201000000001",
            externalMessageId: "wamid.lock-down",
            senderExternalId: "201000000001",
          },
          executeAi: true,
          aiAssistantId: "assistant-1",
          runtimeConfig: { providerConnectionId: "provider-1" },
        }),
      /conversation_turn_lock_unavailable/,
    );
    assert.equal(env.runtimeCalls, 0);
    assert.equal(adapter.sendCalls, 0);
  });

  it("does not send when renewal cannot confirm the same owner", async () => {
    const adapter = new CountingWhatsAppAdapter();
    const env = createTestEnvironment({
      adapters: [adapter],
      companyChannel: { channelKey: "whatsapp", provider: "fake" },
      sharedTurnLock: {
        acquire: async () => true,
        renew: async () => false,
        release: async () => false,
      },
    });

    const result = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: "company-channel-1",
      channelKey: "whatsapp",
      source: "webhook",
      idempotencyKey: "wamid.lock-lost",
      externalThreadId: "201000000001",
      externalMessageId: "wamid.lock-lost",
      payload: {
        text: "عايز احجز",
        externalThreadId: "201000000001",
        externalMessageId: "wamid.lock-lost",
        senderExternalId: "201000000001",
      },
      executeAi: true,
      aiAssistantId: "assistant-1",
      runtimeConfig: { providerConnectionId: "provider-1" },
    });

    assert.equal(env.runtimeCalls, 1);
    assert.equal(adapter.sendCalls, 0);
    assert.equal(result.outboundError, "conversation_turn_lease_lost");
  });
});
