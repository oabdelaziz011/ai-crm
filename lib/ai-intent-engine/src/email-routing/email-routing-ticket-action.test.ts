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
  createInputs: Array<{ customerId?: string | null; companyId: string }>;
  verified: Array<{ companyId: string; customerId: string }>;
} {
  const tickets = [...seed];
  const created: EmailRoutingTicketRef[] = [];
  const assigned: Array<{ ticketId: string; assigneeUserId: string }> = [];
  const createInputs: Array<{ customerId?: string | null; companyId: string }> = [];
  const verified: Array<{ companyId: string; customerId: string }> = [];
  return {
    created,
    assigned,
    createInputs,
    verified,
    port: {
      async listByConversation() {
        return tickets;
      },
      async createTicket(input) {
        createInputs.push({ customerId: input.customerId ?? null, companyId: input.companyId });
        const record: EmailRoutingTicketRef = {
          id: `ticket-${created.length + 1}`,
          ticketNumber: `T-${created.length + 1}`,
          assignedUserId: null,
          customerId: input.customerId ?? null,
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
          customerId: ticket?.customerId ?? null,
        };
      },
      async verifyCustomerCompanyScope(input) {
        verified.push(input);
        // Default mock: same-company prefix convention cust-A / co-A style, or allow listed ids.
        return input.customerId.startsWith("cust-") && input.companyId.startsWith("co-")
          ? !input.customerId.includes("foreign")
          : input.customerId.length > 0;
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

  it("links trustedCustomerId onto created ticket.customer_id", async () => {
    const { port, createInputs, created } = mockTicketPort();
    const result = await applyEmailRoutingTicketAction(port, {
      companyId: "co-1",
      conversationId: "conv-1",
      inboundEventId: "evt-trusted",
      trustedCustomerId: "cust-known",
      subject: "Complaint",
      classification: {
        category: "complaint",
        confidence: 0.95,
        reason: "complaint",
        source: "llm",
      },
      decision: decision({ targetType: "team", targetId: "team-support", category: "complaint" }),
    });
    assert.equal(result.status, "created");
    assert.equal(createInputs[0]?.customerId, "cust-known");
    assert.equal(created[0]?.customerId, "cust-known");
    if (result.status === "created") {
      assert.equal(result.customerId, "cust-known");
    }
  });

  it("ignores model/browser customer ids — only trustedCustomerId is authoritative", async () => {
    const { port, createInputs } = mockTicketPort();
    // Intentionally only trustedCustomerId is on the input type; prove spoof fields are not read.
    const spoofed = {
      companyId: "co-1",
      conversationId: "conv-1",
      inboundEventId: "evt-spoof",
      trustedCustomerId: "cust-A",
      customerId: "cust-B-from-browser",
      modelCustomerId: "cust-B-from-model",
      subject: "Help",
      classification: {
        category: "support",
        confidence: 0.9,
        reason: "support",
        source: "llm",
      },
      decision: decision({ targetType: "team", targetId: "team-support", category: "support" }),
    };
    const result = await applyEmailRoutingTicketAction(port, spoofed as never);
    assert.equal(result.status, "created");
    assert.equal(createInputs[0]?.customerId, "cust-A");
  });

  it("rejects cross-company trusted customer (fail closed, no ticket)", async () => {
    const { port, created, verified } = mockTicketPort();
    const result = await applyEmailRoutingTicketAction(port, {
      companyId: "co-1",
      conversationId: "conv-1",
      inboundEventId: "evt-xco",
      trustedCustomerId: "cust-foreign-b",
      subject: "Help",
      classification: {
        category: "support",
        confidence: 0.9,
        reason: "support",
        source: "llm",
      },
      decision: decision({ targetType: "team", targetId: "team-support", category: "support" }),
    });
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "trusted_customer_company_mismatch");
    assert.equal(created.length, 0);
    assert.equal(verified.length, 1);
  });

  it("creates customerless ticket when trustedCustomerId is missing (no guess)", async () => {
    const { port, createInputs } = mockTicketPort();
    const result = await applyEmailRoutingTicketAction(port, {
      companyId: "co-1",
      conversationId: "conv-1",
      inboundEventId: "evt-unknown",
      trustedCustomerId: null,
      subject: "Hello",
      classification: {
        category: "general_inquiry",
        confidence: 0.8,
        reason: "ok",
        source: "llm",
      },
      decision: decision({
        targetType: "team",
        targetId: "team-general",
        category: "general_inquiry",
      }),
    });
    assert.equal(result.status, "created");
    assert.equal(createInputs[0]?.customerId, null);
  });

  it("reuses existing ticket and preserves its customer_id", async () => {
    const { port, created } = mockTicketPort([
      {
        id: "existing-1",
        ticketNumber: "T-9",
        assignedUserId: null,
        customerId: "cust-known",
        metadata: { source: "email", emailRoutingDecision: { category: "sales" } },
      },
    ]);
    const result = await applyEmailRoutingTicketAction(port, {
      companyId: "co-1",
      conversationId: "conv-1",
      inboundEventId: "evt-reuse",
      trustedCustomerId: "cust-known",
      subject: "Follow-up",
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
      assert.equal(result.customerId, "cust-known");
    }
  });

  it("rejects reuse when existing ticket belongs to a different customer", async () => {
    const { port, created } = mockTicketPort([
      {
        id: "existing-other",
        ticketNumber: "T-2",
        assignedUserId: null,
        customerId: "cust-other",
        metadata: { source: "email", emailRoutingDecision: { category: "support" } },
      },
    ]);
    const result = await applyEmailRoutingTicketAction(port, {
      companyId: "co-1",
      conversationId: "conv-1",
      inboundEventId: "evt-conflict",
      trustedCustomerId: "cust-known",
      subject: "Help",
      classification: {
        category: "support",
        confidence: 0.9,
        reason: "ok",
        source: "llm",
      },
      decision: decision({ targetType: "team", targetId: "team-support" }),
    });
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "ticket_customer_conflict");
    assert.equal(created.length, 0);
  });

  it("leaves null customer_id on reuse when trustedCustomerId is present (no update path)", async () => {
    const { port, created } = mockTicketPort([
      {
        id: "existing-null-customer",
        ticketNumber: "T-3",
        assignedUserId: null,
        customerId: null,
        metadata: { source: "email", emailRoutingDecision: { category: "support" } },
      },
    ]);
    const result = await applyEmailRoutingTicketAction(port, {
      companyId: "co-1",
      conversationId: "conv-1",
      inboundEventId: "evt-null-keep",
      trustedCustomerId: "cust-known",
      subject: "Help",
      classification: {
        category: "support",
        confidence: 0.9,
        reason: "ok",
        source: "llm",
      },
      decision: decision({ targetType: "team", targetId: "team-support" }),
    });
    assert.equal(result.status, "reused");
    assert.equal(created.length, 0);
    if (result.status === "reused") {
      assert.equal(result.customerId, null);
    }
  });
});
