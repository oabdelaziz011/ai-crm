import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyEmailRoutingTicketAction,
  type EmailRoutingTicketPort,
  type EmailRoutingTicketRef,
} from "./index.js";

function mockPort(): {
  port: EmailRoutingTicketPort;
  created: EmailRoutingTicketRef[];
  assigned: Array<{ ticketId: string; assigneeUserId: string }>;
} {
  const tickets: EmailRoutingTicketRef[] = [];
  const created: EmailRoutingTicketRef[] = [];
  const assigned: Array<{ ticketId: string; assigneeUserId: string }> = [];
  return {
    created,
    assigned,
    port: {
      async listByConversation() {
        return tickets;
      },
      async createTicket(input) {
        const record: EmailRoutingTicketRef = {
          id: `ticket-${created.length + 1}`,
          ticketNumber: `T-${created.length + 1}`,
          assignedUserId: null,
          metadata: input.metadata,
        };
        created.push(record);
        tickets.push(record);
        return record;
      },
      async assignEmployee(input) {
        assigned.push({ ticketId: input.ticketId, assigneeUserId: input.assigneeUserId });
        const ticket = tickets.find((row) => row.id === input.ticketId);
        if (ticket) ticket.assignedUserId = input.assigneeUserId;
        return { id: input.ticketId, assignedUserId: input.assigneeUserId };
      },
    },
  };
}

describe("applyEmailRoutingTicketAction Sprint 7 target compatibility", () => {
  it("assigns employee targets via existing assignment path", async () => {
    const { port, created, assigned } = mockPort();
    const result = await applyEmailRoutingTicketAction(port, {
      companyId: "co-1",
      conversationId: "conv-1",
      inboundEventId: "evt-1",
      subject: "Help",
      classification: {
        category: "support",
        confidence: 0.9,
        reason: "ok",
        source: "llm",
      },
      decision: {
        targetType: "employee",
        targetId: "emp-9",
        category: "support",
        confidence: 0.9,
        reason: "configured",
        source: "classification",
        configurationRequired: false,
      },
    });
    assert.equal(result.status, "created");
    assert.equal(created.length, 1);
    assert.equal(assigned.length, 1);
    assert.equal(assigned[0]?.assigneeUserId, "emp-9");
  });

  it("keeps department targets in ticket metadata without employee assignment", async () => {
    const { port, created, assigned } = mockPort();
    const result = await applyEmailRoutingTicketAction(port, {
      companyId: "co-1",
      conversationId: "conv-2",
      inboundEventId: "evt-2",
      subject: "Sales",
      classification: {
        category: "sales",
        confidence: 0.9,
        reason: "ok",
        source: "llm",
      },
      decision: {
        targetType: "department",
        targetId: "dept-1",
        category: "sales",
        confidence: 0.9,
        reason: "configured",
        source: "classification",
        configurationRequired: false,
      },
    });
    assert.equal(result.status, "created");
    assert.equal(assigned.length, 0);
    assert.equal(
      (created[0]?.metadata?.emailRoutingDecision as { targetType?: string } | undefined)?.targetType,
      "department",
    );
    assert.equal(
      (created[0]?.metadata?.emailRoutingDecision as { targetId?: string } | undefined)?.targetId,
      "dept-1",
    );
  });

  it("keeps queue targets in ticket metadata without employee assignment", async () => {
    const { port, created, assigned } = mockPort();
    await applyEmailRoutingTicketAction(port, {
      companyId: "co-1",
      conversationId: "conv-3",
      inboundEventId: "evt-3",
      subject: "Complaint",
      classification: {
        category: "complaint",
        confidence: 0.9,
        reason: "ok",
        source: "llm",
      },
      decision: {
        targetType: "queue",
        targetId: "queue-1",
        category: "complaint",
        confidence: 0.9,
        reason: "configured",
        source: "classification",
        configurationRequired: false,
      },
    });
    assert.equal(assigned.length, 0);
    assert.equal(
      (created[0]?.metadata?.emailRoutingDecision as { targetType?: string } | undefined)?.targetType,
      "queue",
    );
  });
});
