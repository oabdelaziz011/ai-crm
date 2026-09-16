import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readConversationSlaDueAt,
  resolveConversationSlaPresentation,
} from "./conversation-sla-presentation.ts";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";
import type { ConversationTicketContext } from "@/lib/omnichannel/services/conversation-ticket-context";

const labels = {
  prefix: "SLA",
  remainingMinutes: (count: number) => `${count}m`,
  remainingHours: (count: number) => `${count}h`,
  breached: "Breached",
  atRisk: "At risk",
  notSet: "Not configured",
  completed: "Completed",
};

function conversation(overrides: Partial<UnifiedConversation> = {}): UnifiedConversation {
  return {
    id: "c1",
    companyId: "co-a",
    customer: null,
    channel: "whatsapp",
    channelLabel: "WhatsApp",
    lastMessage: null,
    lastActivityAt: null,
    assignedAgent: null,
    handlerMode: "ai",
    lifecycleState: "AI_HANDLING",
    isEscalated: false,
    ownerLabel: null,
    ownershipTier: "unassigned",
    assignedToUserId: null,
    priority: "normal",
    status: "waiting_user",
    unreadCount: 0,
    isPinned: false,
    isArchived: false,
    conversationNumber: "1",
    companyChannelId: null,
    externalThreadId: null,
    ticketContext: null,
    source: {
      id: "c1",
      company_id: "co-a",
      metadata: { lifecycle: { slaDueAt: "2026-09-01T00:00:00.000Z" } },
    } as UnifiedConversation["source"],
    ...overrides,
  };
}

function activeTicket(overrides: Partial<ConversationTicketContext> = {}): ConversationTicketContext {
  return {
    ticketId: "t1",
    ticketNumber: "TKT-001",
    subject: "Help",
    status: "open",
    priority: "high",
    slaDueAt: "2026-09-05T18:00:00.000Z",
    isActive: true,
    ...overrides,
  };
}

describe("ticket-centric conversation SLA presentation", () => {
  it("A. conversation without ticket → no SLA (ignores stale metadata)", () => {
    assert.equal(readConversationSlaDueAt(conversation()), null);
    const result = resolveConversationSlaPresentation({
      dueAt: readConversationSlaDueAt(conversation()),
      labels,
    });
    assert.equal(result.state, "unavailable");
  });

  it("B. booking-style conversation without ticket → no SLA", () => {
    const booking = conversation({
      source: {
        id: "c1",
        company_id: "co-a",
        metadata: { intent: "booking", lifecycle: { slaDueAt: "2026-09-01T00:00:00.000Z" } },
      } as UnifiedConversation["source"],
    });
    assert.equal(readConversationSlaDueAt(booking), null);
  });

  it("C. sales/general without ticket → no SLA", () => {
    assert.equal(readConversationSlaDueAt(conversation({ channel: "web_chat" as never })), null);
  });

  it("D. active ticket → SLA due from ticket", () => {
    const due = "2026-09-05T18:00:00.000Z";
    const withTicket = conversation({ ticketContext: activeTicket({ slaDueAt: due }) });
    assert.equal(readConversationSlaDueAt(withTicket), due);
  });

  it("I. closed/inactive ticket context → no active SLA", () => {
    const closed = conversation({
      ticketContext: activeTicket({ isActive: false, status: "closed" }),
    });
    assert.equal(readConversationSlaDueAt(closed), null);
  });

  it("L. stale metadata.slaDueAt + no ticket → no SLA", () => {
    assert.equal(readConversationSlaDueAt(conversation()), null);
  });

  it("reports breached when ticket dueAt is in the past", () => {
    const now = new Date("2026-09-05T12:00:00.000Z");
    const result = resolveConversationSlaPresentation({
      dueAt: "2026-09-05T11:00:00.000Z",
      labels,
      now,
    });
    assert.equal(result.state, "breached");
    assert.equal(result.tone, "danger");
  });

  it("reports at_risk within existing 1h warning window", () => {
    const now = new Date("2026-09-05T12:00:00.000Z");
    const result = resolveConversationSlaPresentation({
      dueAt: "2026-09-05T12:30:00.000Z",
      labels,
      now,
    });
    assert.equal(result.state, "at_risk");
    assert.equal(result.tone, "warn");
  });

  it("reports healthy when due is outside warning window", () => {
    const now = new Date("2026-09-05T12:00:00.000Z");
    const result = resolveConversationSlaPresentation({
      dueAt: "2026-09-05T18:00:00.000Z",
      labels,
      now,
    });
    assert.equal(result.state, "healthy");
    assert.match(result.shortLabel, /SLA 6h/);
  });

  it("reports unavailable when dueAt is missing", () => {
    const result = resolveConversationSlaPresentation({ dueAt: null, labels });
    assert.equal(result.state, "unavailable");
    assert.equal(result.tone, "neutral");
  });
});
