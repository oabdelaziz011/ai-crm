import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationRecord } from "@workspace/ai-conversation";
import {
  buildConversationIdentityInitials,
  resolveConversationIdentityAvatar,
} from "./conversation-identity-avatar.ts";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";

function source(partial: Partial<ConversationRecord> & Pick<ConversationRecord, "id">): ConversationRecord {
  return {
    company_id: "co-a",
    conversation_number: "1",
    company_channel_id: "cc-1",
    ai_assistant_id: "ai-1",
    channel_type: "whatsapp",
    channel_instance_id: null,
    state: "waiting_user",
    external_thread_id: "+201000000000",
    customer_id: null,
    assigned_user_id: null,
    metadata: {},
    priority: "normal",
    locked_by: null,
    locked_at: null,
    unread_count_employee: 0,
    unread_count_customer: 0,
    last_message_at: null,
    last_message_preview: null,
    last_participant_type: null,
    search_text: "",
    started_at: "2026-09-01T00:00:00.000Z",
    ended_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
    ...partial,
  } as ConversationRecord;
}

function conversation(
  overrides: Partial<UnifiedConversation> & { source?: ConversationRecord } = {},
): UnifiedConversation {
  const src = overrides.source ?? source({ id: "conv-1" });
  return {
    id: src.id,
    companyId: src.company_id,
    customer: null,
    channel: src.channel_type,
    channelLabel: String(src.channel_type),
    lastMessage: null,
    lastActivityAt: src.last_message_at,
    assignedAgent: null,
    handlerMode: "ai",
    lifecycleState: "AI_HANDLING",
    isEscalated: false,
    ownerLabel: null,
    ownershipTier: "unassigned",
    assignedToUserId: null,
    priority: src.priority,
    status: src.state,
    unreadCount: 0,
    isPinned: false,
    isArchived: false,
    conversationNumber: src.conversation_number,
    companyChannelId: src.company_channel_id,
    externalThreadId: src.external_thread_id,
    source: src,
    ...overrides,
  };
}

describe("resolveConversationIdentityAvatar", () => {
  it("uses provider profile image when metadata already has a trusted HTTPS URL", () => {
    const result = resolveConversationIdentityAvatar({
      conversation: conversation({
        source: source({
          id: "wa-1",
          channel_type: "whatsapp",
          metadata: { profileImageUrl: "https://cdn.example/wa-pic.jpg", senderName: "WA Nick" },
        }),
      }),
      visitorLabel: "Visitor",
    });
    assert.equal(result.source, "provider");
    assert.equal(result.imageUrl, "https://cdn.example/wa-pic.jpg");
    assert.equal(result.channel, "whatsapp");
  });

  it("falls back to initials when provider image is unavailable", () => {
    const result = resolveConversationIdentityAvatar({
      conversation: conversation({
        source: source({
          id: "wa-2",
          channel_type: "whatsapp",
          metadata: { senderName: "Omar", senderExternalId: "201000000001" },
        }),
      }),
      visitorLabel: "Visitor",
    });
    assert.equal(result.imageUrl, null);
    assert.ok(result.source === "conversation" || result.source === "fallback");
    assert.ok(result.initials.length >= 1);
  });

  it("uses CRM avatar when customer.avatarUrl is present and no provider image", () => {
    const result = resolveConversationIdentityAvatar({
      conversation: conversation({
        customer: {
          id: "cust-1",
          name: "Omar Abdelaziz",
          phone: "+201000000001",
          email: null,
          avatarUrl: "https://cdn.example/crm-avatar.png",
        },
        source: source({ id: "crm-1", customer_id: "cust-1", metadata: {} }),
      }),
    });
    assert.equal(result.source, "crm");
    assert.equal(result.imageUrl, "https://cdn.example/crm-avatar.png");
    assert.equal(result.customerName, "Omar Abdelaziz");
    assert.equal(result.isLinkedCustomer, true);
  });

  it("rejects invalid CRM avatar URL and falls back to initials", () => {
    const result = resolveConversationIdentityAvatar({
      conversation: conversation({
        customer: {
          id: "cust-bad",
          name: "Bad Url",
          phone: null,
          email: null,
          avatarUrl: "javascript:alert(1)",
        },
        source: source({ id: "crm-bad", customer_id: "cust-bad", metadata: {} }),
      }),
    });
    assert.equal(result.imageUrl, null);
    assert.equal(result.initials, "BU");
  });

  it("provider trusted image still wins over CRM avatar", () => {
    const result = resolveConversationIdentityAvatar({
      conversation: conversation({
        customer: {
          id: "cust-2",
          name: "CRM Name",
          phone: null,
          email: null,
          avatarUrl: "https://cdn.example/crm-avatar.png",
        },
        source: source({
          id: "prio-1",
          customer_id: "cust-2",
          metadata: { profileImageUrl: "https://cdn.example/provider.jpg" },
        }),
      }),
    });
    assert.equal(result.source, "provider");
    assert.equal(result.imageUrl, "https://cdn.example/provider.jpg");
  });

  it("initials fallback uses real display name", () => {
    assert.equal(buildConversationIdentityInitials("Omar Abdelaziz"), "OA");
    const result = resolveConversationIdentityAvatar({
      conversation: conversation({
        customer: { id: "c1", name: "Omar Abdelaziz", phone: null, email: null },
        source: source({ id: "i1", customer_id: "c1" }),
      }),
    });
    assert.equal(result.imageUrl, null);
    assert.equal(result.initials, "OA");
    assert.equal(result.displayName, "Omar Abdelaziz");
  });

  it("WhatsApp identity prefers CRM name and does not invent an image", () => {
    const result = resolveConversationIdentityAvatar({
      conversation: conversation({
        channel: "whatsapp",
        customer: { id: "c1", name: "Omar Abdelaziz", phone: "+201000000001", email: null },
        source: source({
          id: "wa-3",
          channel_type: "whatsapp",
          customer_id: "c1",
          metadata: { senderName: "Omar WA", senderExternalId: "201000000001" },
        }),
      }),
    });
    assert.equal(result.displayName, "Omar Abdelaziz");
    assert.equal(result.customerName, "Omar Abdelaziz");
    assert.equal(result.imageUrl, null);
    assert.equal(result.channel, "whatsapp");
  });

  it("Messenger identity: PSID metadata without profile pic → initials", () => {
    const result = resolveConversationIdentityAvatar({
      conversation: conversation({
        channel: "messenger",
        source: source({
          id: "msg-1",
          channel_type: "messenger",
          metadata: { senderExternalId: "psid-123", pageId: "page-1" },
        }),
      }),
    });
    assert.equal(result.channel, "messenger");
    assert.equal(result.imageUrl, null);
  });

  it("Instagram identity: sender id without profile pic → initials", () => {
    const result = resolveConversationIdentityAvatar({
      conversation: conversation({
        channel: "instagram",
        source: source({
          id: "ig-1",
          channel_type: "instagram",
          metadata: { senderExternalId: "igsid-9", instagramUsername: "clinic_fan" },
        }),
      }),
    });
    assert.equal(result.channel, "instagram");
    assert.equal(result.imageUrl, null);
    assert.match(result.displayName, /clinic_fan/i);
  });

  it("unknown sender keeps conversation identity without claiming CRM linkage", () => {
    const result = resolveConversationIdentityAvatar({
      conversation: conversation({
        customer: null,
        source: source({
          id: "unk-1",
          channel_type: "whatsapp",
          customer_id: null,
          metadata: { senderExternalId: "201099999999" },
          external_thread_id: "201099999999",
        }),
      }),
      visitorLabel: "Visitor",
    });
    assert.equal(result.isLinkedCustomer, false);
    assert.equal(result.customerId, null);
    assert.equal(result.imageUrl, null);
  });

  it("does not let provider nickname overwrite CRM customerName field", () => {
    const result = resolveConversationIdentityAvatar({
      conversation: conversation({
        customer: { id: "c9", name: "CRM Legal Name", phone: null, email: null },
        source: source({
          id: "ov-1",
          customer_id: "c9",
          metadata: {
            senderName: "Provider Nick",
            profileImageUrl: "https://cdn.example/provider.jpg",
          },
        }),
      }),
    });
    assert.equal(result.customerName, "CRM Legal Name");
    assert.equal(result.displayName, "CRM Legal Name");
    assert.equal(result.source, "provider");
    assert.equal(result.imageUrl, "https://cdn.example/provider.jpg");
  });

  it("tenant mismatch blocks image URL (company isolation)", () => {
    const result = resolveConversationIdentityAvatar({
      conversation: conversation({
        companyId: "co-a",
        source: source({
          id: "iso-1",
          company_id: "co-a",
          metadata: { profileImageUrl: "https://cdn.example/other.jpg" },
        }),
      }),
      expectedCompanyId: "co-b",
    });
    assert.equal(result.imageUrl, null);
    assert.equal(result.source, "fallback");
  });

  it("shared resolver is consistent for list and header inputs", () => {
    const conv = conversation({
      customer: { id: "c1", name: "Same Person", phone: null, email: null },
      source: source({ id: "same-1", customer_id: "c1" }),
    });
    const list = resolveConversationIdentityAvatar({ conversation: conv, expectedCompanyId: conv.companyId });
    const header = resolveConversationIdentityAvatar({
      conversation: conv,
      customer: conv.customer,
      expectedCompanyId: conv.companyId,
    });
    assert.deepEqual(
      { name: list.displayName, initials: list.initials, image: list.imageUrl, source: list.source },
      { name: header.displayName, initials: header.initials, image: header.imageUrl, source: header.source },
    );
  });

  it("does not perform provider network requests (sync, no fetch side effects)", () => {
    const before = globalThis.fetch;
    let fetchCalls = 0;
    // @ts-expect-error test stub
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("unexpected fetch");
    };
    try {
      for (let i = 0; i < 20; i += 1) {
        resolveConversationIdentityAvatar({
          conversation: conversation({
            source: source({ id: `n${i}`, metadata: { senderExternalId: `x${i}` } }),
          }),
        });
      }
      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = before;
    }
  });

  it("rejects unsafe avatar URL schemes", () => {
    const result = resolveConversationIdentityAvatar({
      conversation: conversation({
        source: source({
          id: "bad-1",
          metadata: { profileImageUrl: "javascript:alert(1)" },
        }),
      }),
    });
    assert.equal(result.imageUrl, null);
  });
});
