import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyEmailRoutingTicketAction,
  isEmailRoutingDecisionResolvable,
  type EmailRoutingTicketPort,
  type EmailRoutingTicketRef,
} from "./index.js";

function decision(
  overrides: Partial<{
    targetType: "unresolved" | "department" | "team" | "queue" | "employee";
    targetId: string | null;
    category: "sales" | "support" | "billing" | "complaint" | "hr" | "general_inquiry";
    confidence: number;
    configurationRequired: boolean;
  }> = {},
) {
  return {
    targetType: overrides.targetType ?? "team",
    targetId: overrides.targetId ?? "team-1",
    category: overrides.category ?? "sales",
    confidence: overrides.confidence ?? 0.9,
    reason: "test",
    source: "classification" as const,
    configurationRequired: overrides.configurationRequired ?? false,
  };
}

function mockTicketPort(seed: EmailRoutingTicketRef[] = []): {
  port: EmailRoutingTicketPort;
  created: EmailRoutingTicketRef[];
  assigned: Array<{ ticketId: string; assigneeUserId: string }>;
} {
  const tickets = [...seed];
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
        const ticket = tickets.find((t) => t.id === input.ticketId);
        if (ticket) ticket.assignedUserId = input.assigneeUserId;
        return {
          id: input.ticketId,
          assignedUserId: input.assigneeUserId,
        };
      },
    },
  };
}

describe("applyEmailRoutingTicketAction (Sprint 5)", () => {
  it("skips unresolved routing without creating a ticket", async () => {
    const { port, created } = mockTicketPort();
    const result = await applyEmailRoutingTicketAction(port, {
      companyId: "co-1",
      conversationId: "conv-1",
      inboundEventId: "evt-1",
      subject: "Hello",
      classification: {
        category: "sales",
        confidence: 0.9,
        reason: "ok",
        source: "llm",
      },
      decision: decision({
        targetType: "unresolved",
        targetId: null,
        configurationRequired: true,
      }),
    });
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "routing_unresolved");
    assert.equal(created.length, 0);
    assert.equal(isEmailRoutingDecisionResolvable(decision({ configurationRequired: true })), false);
  });

  it("creates a ticket for a resolvable team target without inventing an assignee", async () => {
    const { port, created, assigned } = mockTicketPort();
    const result = await applyEmailRoutingTicketAction(port, {
      companyId: "co-1",
      conversationId: "conv-1",
      inboundEventId: "evt-2",
      subject: "Demo request",
      bodyPreview: "Need pricing",
      classification: {
        category: "sales",
        confidence: 0.91,
        reason: "pricing",
        source: "llm",
      },
      decision: decision({ targetType: "team", targetId: "team-sales", category: "sales" }),
    });
    assert.equal(result.status, "created");
    assert.equal(created.length, 1);
    assert.equal(assigned.length, 0);
    assert.equal(created[0]?.metadata?.source, "email");
    assert.equal(
      (created[0]?.metadata?.emailRoutingDecision as { targetId: string }).targetId,
      "team-sales",
    );
    if (result.status === "created") {
      assert.equal(result.assignedUserId, null);
      assert.equal(result.targetType, "team");
    }
  });

  it("assigns an employee through the existing assignment path when targetType is employee", async () => {
    const { port, assigned } = mockTicketPort();
    const result = await applyEmailRoutingTicketAction(port, {
      companyId: "co-1",
      conversationId: "conv-1",
      inboundEventId: "evt-3",
      subject: "Help",
      classification: {
        category: "support",
        confidence: 0.88,
        reason: "support",
        source: "llm",
      },
      decision: decision({
        targetType: "employee",
        targetId: "user-42",
        category: "support",
      }),
    });
    assert.equal(result.status, "created");
    assert.equal(assigned.length, 1);
    assert.equal(assigned[0]?.assigneeUserId, "user-42");
    if (result.status === "created") {
      assert.equal(result.assignedUserId, "user-42");
    }
  });

  it("reuses an existing conversation ticket (idempotent)", async () => {
    const { port, created } = mockTicketPort([
      {
        id: "existing-1",
        ticketNumber: "T-9",
        assignedUserId: null,
        metadata: { source: "email", emailRoutingDecision: { category: "sales" } },
      },
    ]);
    const result = await applyEmailRoutingTicketAction(port, {
      companyId: "co-1",
      conversationId: "conv-1",
      inboundEventId: "evt-4",
      subject: "Demo request",
      classification: {
        category: "sales",
        confidence: 0.9,
        reason: "ok",
        source: "llm",
      },
      decision: decision({ targetType: "team", targetId: "team-sales" }),
    });
    assert.equal(result.status, "reused");
    assert.equal(created.length, 0);
    if (result.status === "reused") {
      assert.equal(result.ticketId, "existing-1");
    }
  });

  it("preserves companyId on create/assign calls", async () => {
    const companies: string[] = [];
    const port: EmailRoutingTicketPort = {
      async listByConversation(input) {
        companies.push(input.companyId);
        return [];
      },
      async createTicket(input) {
        companies.push(input.companyId);
        return { id: "t1", ticketNumber: "T-1", assignedUserId: null, metadata: input.metadata };
      },
      async assignEmployee(input) {
        companies.push(input.companyId);
        return { id: input.ticketId, assignedUserId: input.assigneeUserId };
      },
    };
    await applyEmailRoutingTicketAction(port, {
      companyId: "co-secure",
      conversationId: "conv-1",
      inboundEventId: "evt-5",
      subject: "x",
      classification: { category: "hr", confidence: 0.9, reason: "hr", source: "llm" },
      decision: decision({ targetType: "employee", targetId: "u1", category: "hr" }),
    });
    assert.ok(companies.every((id) => id === "co-secure"));
  });
});
