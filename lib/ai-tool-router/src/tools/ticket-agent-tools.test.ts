import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TicketAgentToolPorts, TicketSummary } from "./ticket-agent-ports.js";
import {
  createTicketAgentTools,
  CREATE_TICKET_TOOL_KEY,
  TICKET_CUSTOMER_CONTEXT_REQUIRED_MESSAGE,
  TICKET_CUSTOMER_OWNERSHIP_DENIED_MESSAGE,
} from "./ticket-agent-tools.js";
import type { ToolExecutionContext } from "./tool-contract.js";

function createTicket(overrides: Partial<TicketSummary> = {}): TicketSummary {
  return {
    id: "ticket-1",
    ticketNumber: "TKT-000001",
    subject: "Billing issue",
    description: "Payment failed",
    status: "open",
    priority: "high",
    customerId: "customer-a",
    conversationId: "conv-1",
    assignedUserId: null,
    assignedUserName: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
    ...overrides,
  };
}

function baseContext(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    companyId: "company-1",
    conversationId: "conv-1",
    conversationState: "waiting_user",
    userId: "user-1",
    trustedCustomerId: "customer-a",
    ...overrides,
  };
}

function createStubPorts(overrides: Partial<TicketAgentToolPorts> = {}): TicketAgentToolPorts {
  const tickets = new Map<string, TicketSummary>([
    [
      "ticket-a",
      createTicket({
        id: "ticket-a",
        customerId: "customer-a",
        ticketNumber: "TKT-000001",
        conversationId: "conv-other",
      }),
    ],
    [
      "ticket-b",
      createTicket({
        id: "ticket-b",
        customerId: "customer-b",
        ticketNumber: "TKT-000002",
        subject: "Other",
        conversationId: "conv-other",
      }),
    ],
  ]);

  return {
    async getTicket(input) {
      const ticket = tickets.get(input.ticketId);
      if (!ticket) return null;
      // Simulate company-scoped lookup: wrong company → not found
      if (input.companyId !== "company-1") return null;
      return { ticket };
    },
    async createTicket(input) {
      return {
        ticket: createTicket({
          subject: input.subject,
          priority: input.priority ?? "normal",
          customerId: input.customerId ?? null,
          conversationId: input.conversationId ?? null,
        }),
      };
    },
    async updateTicket(input) {
      return { ticket: createTicket({ id: input.ticketId, subject: input.subject ?? "Updated" }) };
    },
    async closeTicket(input) {
      return {
        ticket: createTicket({
          id: input.ticketId,
          status: input.status ?? "closed",
          closedAt: new Date().toISOString(),
        }),
      };
    },
    async assignTicket(input) {
      return {
        ticket: createTicket({
          id: input.ticketId,
          assignedUserId: input.assigneeUserId ?? "agent-ahmed",
          assignedUserName: input.assigneeName ?? "Ahmed",
          status: "in_progress",
        }),
      };
    },
    async addTicketComment(input) {
      return { commentId: "comment-1", ticketId: input.ticketId };
    },
    async changeTicketPriority(input) {
      return { ticket: createTicket({ id: input.ticketId, priority: input.priority }) };
    },
    async changeTicketStatus(input) {
      return { ticket: createTicket({ id: input.ticketId, status: input.status }) };
    },
    async searchTickets(input) {
      const all = [...tickets.values()].filter((t) => {
        if (input.customerId && t.customerId !== input.customerId) return false;
        return true;
      });
      return { tickets: all, total: all.length };
    },
    ...overrides,
  };
}

describe("createTicketAgentTools", () => {
  it("creates a high priority ticket for trusted customer", async () => {
    const created: Array<Record<string, unknown>> = [];
    const tools = createTicketAgentTools(
      createStubPorts({
        async createTicket(input) {
          created.push(input);
          return {
            ticket: createTicket({
              priority: input.priority ?? "normal",
              subject: input.subject,
              customerId: input.customerId ?? null,
            }),
          };
        },
      }),
    );

    const output = await tools[CREATE_TICKET_TOOL_KEY]!.execute(baseContext(), {
      subject: "Payment failed",
      priority: "high",
      description: "Checkout error",
    });

    assert.equal(output.success, true);
    assert.equal(created[0]?.priority, "high");
    assert.equal(created[0]?.customerId, "customer-a");
  });

  it("always creates a new ticket even when a similar open ticket already exists", async () => {
    const created: Array<Record<string, unknown>> = [];
    const existing = createTicket({
      id: "ticket-open",
      ticketNumber: "TKT-000042",
      subject: "مشكلة في دفع حجز العيادة",
      customerId: "customer-a",
      conversationId: "conv-1",
      status: "open",
    });
    const tools = createTicketAgentTools(
      createStubPorts({
        async searchTickets() {
          return { tickets: [existing], total: 1 };
        },
        async createTicket(input) {
          created.push(input);
          return {
            ticket: createTicket({
              id: "ticket-new",
              ticketNumber: "TKT-000099",
              subject: input.subject,
              customerId: input.customerId ?? null,
              conversationId: input.conversationId ?? null,
            }),
          };
        },
      }),
    );

    const output = await tools[CREATE_TICKET_TOOL_KEY]!.execute(baseContext(), {
      subject: "مشكلة في دفع حجز العيادة",
      priority: "high",
    });

    assert.equal(output.success, true);
    assert.equal(output.ticketNumber, "TKT-000099");
    assert.equal(created.length, 1);
    assert.match(String(output.message ?? ""), /TKT-000099/);
  });

  it("search_ticket lists trusted customer tickets when no ticket number is provided", async () => {
    let searched = 0;
    let seenCustomerId: string | null = null;
    const tools = createTicketAgentTools(
      createStubPorts({
        async searchTickets(input) {
          searched += 1;
          seenCustomerId = input.customerId ?? null;
          return {
            tickets: [
              createTicket({
                id: "new",
                ticketNumber: "TKT-000022",
                status: "open",
                customerId: "customer-a",
                createdAt: "2026-08-20T19:50:00.000Z",
              }),
              createTicket({
                id: "older",
                ticketNumber: "TKT-000021",
                status: "closed",
                customerId: "customer-a",
                createdAt: "2026-08-20T18:50:00.000Z",
              }),
            ],
            total: 2,
          };
        },
      }),
    );

    const output = await tools.search_ticket!.execute(baseContext(), {});
    assert.equal(output.success, true);
    assert.equal(output.total, 2);
    assert.equal(searched, 1);
    assert.equal(seenCustomerId, "customer-a");
    assert.equal(output.tickets?.[0]?.ticketNumber, "TKT-000022");
    assert.equal("subject" in (output.tickets?.[0] ?? {}), false);
  });

  it("search_ticket by ticket number returns status without subject/description", async () => {
    const tools = createTicketAgentTools(
      createStubPorts({
        async searchTickets() {
          return {
            tickets: [
              createTicket({
                id: "new",
                ticketNumber: "TKT-000022",
                status: "open",
                subject: "Secret subject",
                description: "Secret description",
                createdAt: "2026-08-20T19:50:00.000Z",
              }),
            ],
            total: 1,
          };
        },
      }),
    );

    const output = await tools.search_ticket!.execute(baseContext(), {
      query: "TKT-000022",
    });
    assert.equal(output.success, true);
    assert.equal(output.matchedTicketNumber, "TKT-000022");
    assert.equal(output.status, "open");
    assert.equal(output.tickets[0]?.ticketNumber, "TKT-000022");
    assert.equal((output.tickets[0] as { subject?: unknown }).subject, undefined);
    assert.equal((output.tickets[0] as { description?: unknown }).description, undefined);
    assert.match(String(output.message ?? ""), /exact status "open"/i);
  });

  it("search_ticket rejects fuzzy non-exact ticket hits", async () => {
    const tools = createTicketAgentTools(
      createStubPorts({
        async searchTickets() {
          return {
            tickets: [
              createTicket({
                id: "other",
                ticketNumber: "TKT-000080",
                status: "closed",
                createdAt: "2026-08-20T19:50:00.000Z",
              }),
            ],
            total: 1,
          };
        },
      }),
    );

    const output = await tools.search_ticket!.execute(baseContext(), {
      query: "TKT-000085",
    });
    assert.equal(output.success, true);
    assert.equal(output.matchedTicketNumber, null);
    assert.equal(output.total, 0);
    assert.deepEqual(output.tickets, []);
  });

  it("search_ticket ignores phone-like query and asks for ticket number", async () => {
    let searched = 0;
    const tools = createTicketAgentTools(
      createStubPorts({
        async searchTickets() {
          searched += 1;
          return { tickets: [], total: 0 };
        },
      }),
    );

    const output = await tools.search_ticket!.execute(baseContext(), {
      query: "201023169075",
    });
    assert.equal(output.success, true);
    assert.equal(output.needsTicketNumber, true);
    assert.equal(searched, 0);
  });

  it("assigns ticket to Ahmed when owned by trusted customer", async () => {
    const tools = createTicketAgentTools(createStubPorts());
    const output = await tools.assign_ticket!.execute(baseContext(), {
      ticketId: "ticket-a",
      assigneeName: "Ahmed",
    });

    assert.equal(output.success, true);
    assert.equal(output.assignedUserName, "Ahmed");
  });

  it("closes ticket when owned by trusted customer", async () => {
    const tools = createTicketAgentTools(createStubPorts());
    const output = await tools.close_ticket!.execute(baseContext(), {
      ticketId: "ticket-a",
      resolutionNote: "Resolved by AI",
    });

    assert.equal(output.success, true);
    assert.equal(output.status, "closed");
  });

  it("rejects close when ticket is already closed", async () => {
    const tools = createTicketAgentTools(
      createStubPorts({
        async getTicket() {
          return { ticket: createTicket({ id: "ticket-a", status: "closed" }) };
        },
      }),
    );
    const output = await tools.close_ticket!.execute(baseContext(), { ticketId: "TKT-000001" });
    assert.equal(output.success, false);
    assert.equal(output.errorCode, "TICKET_ALREADY_CLOSED");
  });

  it("change_ticket_status accepts Arabic قيد المعالجة → in_progress", async () => {
    let seenStatus: string | null = null;
    const tools = createTicketAgentTools(
      createStubPorts({
        async changeTicketStatus(input) {
          seenStatus = input.status;
          return { ticket: createTicket({ id: "ticket-a", status: input.status }) };
        },
      }),
    );
    const output = await tools.change_ticket_status!.execute(baseContext(), {
      ticketId: "ticket-a",
      status: "قيد المعالجة",
    });
    assert.equal(output.success, true);
    assert.equal(seenStatus, "in_progress");
    assert.equal(output.status, "in_progress");
  });

  it("change_ticket_priority accepts Arabic عالية → high", async () => {
    let seenPriority: string | null = null;
    const tools = createTicketAgentTools(
      createStubPorts({
        async changeTicketPriority(input) {
          seenPriority = input.priority;
          return { ticket: createTicket({ id: "ticket-a", priority: input.priority }) };
        },
      }),
    );
    const output = await tools.change_ticket_priority!.execute(baseContext(), {
      ticketId: "ticket-a",
      priority: "عالية",
    });
    assert.equal(output.success, true);
    assert.equal(seenPriority, "high");
  });

  it("rejects invalid Arabic status without mutating", async () => {
    let mutated = false;
    const tools = createTicketAgentTools(
      createStubPorts({
        async changeTicketStatus() {
          mutated = true;
          return { ticket: createTicket({ id: "ticket-a" }) };
        },
      }),
    );
    assert.throws(() =>
      tools.change_ticket_status!.validate({
        ticketId: "ticket-a",
        status: "حالة_خيالية",
      }),
    );
    assert.equal(mutated, false);
  });

  it("adds internal note when owned by trusted customer", async () => {
    const comments: Array<Record<string, unknown>> = [];
    const tools = createTicketAgentTools(
      createStubPorts({
        async addTicketComment(input) {
          comments.push(input);
          return { commentId: "comment-1", ticketId: input.ticketId };
        },
      }),
    );

    const output = await tools.add_ticket_comment!.execute(baseContext(), {
      ticketId: "ticket-a",
      body: "Escalated to billing",
      isInternal: true,
    });

    assert.equal(output.success, true);
    assert.equal(comments[0]?.isInternal, true);
  });

  it("requires authenticated user", async () => {
    const tools = createTicketAgentTools(createStubPorts());
    await assert.rejects(
      () =>
        tools.create_ticket!.execute(
          baseContext({ userId: null }),
          { subject: "Test" },
        ),
      /authenticated user/i,
    );
  });
});

describe("Phase 4B ticket channel ownership", () => {
  it("create: trusted A + LLM customer A → ticket customer A", async () => {
    const created: Array<Record<string, unknown>> = [];
    const tools = createTicketAgentTools(
      createStubPorts({
        async createTicket(input) {
          created.push(input);
          return { ticket: createTicket({ customerId: input.customerId ?? null, subject: input.subject }) };
        },
      }),
    );

    const output = await tools.create_ticket!.execute(baseContext(), {
      subject: "Help",
      customerId: "customer-a",
    });

    assert.equal(output.success, true);
    assert.equal(created[0]?.customerId, "customer-a");
    assert.equal(output.ticket.customerId, "customer-a");
  });

  it("create: trusted A + LLM customer B → forces customer A (ignores LLM)", async () => {
    const created: Array<Record<string, unknown>> = [];
    const tools = createTicketAgentTools(
      createStubPorts({
        async createTicket(input) {
          created.push(input);
          return { ticket: createTicket({ customerId: input.customerId ?? null, subject: input.subject }) };
        },
      }),
    );

    const output = await tools.create_ticket!.execute(baseContext(), {
      subject: "Help",
      customerId: "customer-b",
    });

    assert.equal(output.success, true);
    assert.equal(created[0]?.customerId, "customer-a");
    assert.notEqual(created[0]?.customerId, "customer-b");
  });

  it("create: no trusted customer → CUSTOMER_CONTEXT_REQUIRED", async () => {
    let called = false;
    const tools = createTicketAgentTools(
      createStubPorts({
        async createTicket(input) {
          called = true;
          return { ticket: createTicket({ subject: input.subject }) };
        },
      }),
    );

    const output = await tools.create_ticket!.execute(baseContext({ trustedCustomerId: null }), {
      subject: "Help",
      customerId: "customer-b",
    });

    assert.equal(output.success, false);
    assert.equal(output.errorCode, "CUSTOMER_CONTEXT_REQUIRED");
    assert.deepEqual(output.errors, ["CUSTOMER_CONTEXT_REQUIRED"]);
    assert.equal(output.message, TICKET_CUSTOMER_CONTEXT_REQUIRED_MESSAGE);
    assert.equal(called, false);
  });

  it("search: trusted A → only A tickets", async () => {
    const searched: Array<Record<string, unknown>> = [];
    const tools = createTicketAgentTools(
      createStubPorts({
        async searchTickets(input) {
          searched.push(input);
          return {
            tickets: [createTicket({ id: "ticket-a", ticketNumber: "TKT-000010", customerId: "customer-a" })],
            total: 1,
          };
        },
      }),
    );

    const output = await tools.search_ticket!.execute(baseContext(), { query: "TKT-000010" });

    assert.equal(output.success, true);
    assert.equal(searched[0]?.customerId, "customer-a");
    assert.equal(output.total, 1);
    assert.equal(output.tickets[0].customerId, "customer-a");
  });

  it("search: LLM asks for customer B while trusted A → still only A", async () => {
    const searched: Array<Record<string, unknown>> = [];
    const tools = createTicketAgentTools(
      createStubPorts({
        async searchTickets(input) {
          searched.push(input);
          return {
            tickets: [
              createTicket({
                id: "ticket-a",
                ticketNumber: "TKT-000010",
                customerId: input.customerId ?? null,
              }),
            ],
            total: 1,
          };
        },
      }),
    );

    const output = await tools.search_ticket!.execute(baseContext(), {
      query: "TKT-000010",
      customerId: "customer-b",
    });

    assert.equal(output.success, true);
    assert.equal(searched[0]?.customerId, "customer-a");
    assert.notEqual(searched[0]?.customerId, "customer-b");
  });

  it("search: no trusted customer → deny with empty results (no company-wide leak)", async () => {
    let called = false;
    const tools = createTicketAgentTools(
      createStubPorts({
        async searchTickets() {
          called = true;
          return { tickets: [createTicket()], total: 1 };
        },
      }),
    );

    const output = await tools.search_ticket!.execute(baseContext({ trustedCustomerId: null }), {});

    assert.equal(output.success, false);
    assert.equal(output.errorCode, "CUSTOMER_CONTEXT_REQUIRED");
    assert.deepEqual(output.tickets, []);
    assert.deepEqual(output.results, []);
    assert.equal(output.total, 0);
    assert.equal(called, false);
  });

  const mutationTools = [
    "update_ticket",
    "close_ticket",
    "assign_ticket",
    "add_ticket_comment",
    "change_ticket_priority",
    "change_ticket_status",
  ] as const;

  for (const toolKey of mutationTools) {
    it(`${toolKey}: customer A + ticket A → ALLOW`, async () => {
      const tools = createTicketAgentTools(createStubPorts());
      const input =
        toolKey === "assign_ticket"
          ? { ticketId: "ticket-a", assigneeName: "Ahmed" }
          : toolKey === "add_ticket_comment"
            ? { ticketId: "ticket-a", body: "note" }
            : toolKey === "change_ticket_priority"
              ? { ticketId: "ticket-a", priority: "urgent" }
              : toolKey === "change_ticket_status"
                ? { ticketId: "ticket-a", status: "in_progress" }
                : toolKey === "update_ticket"
                  ? { ticketId: "ticket-a", subject: "Updated subject" }
                  : { ticketId: "ticket-a" };

      const output = await tools[toolKey]!.execute(baseContext(), input);
      assert.equal(output.success, true, `${toolKey} should allow owned ticket`);
    });

    it(`${toolKey}: customer A + ticket B → CUSTOMER_OWNERSHIP_DENIED`, async () => {
      let mutated = false;
      const tools = createTicketAgentTools(
        createStubPorts({
          async updateTicket(input) {
            mutated = true;
            return { ticket: createTicket({ id: input.ticketId }) };
          },
          async closeTicket(input) {
            mutated = true;
            return { ticket: createTicket({ id: input.ticketId, status: "closed" }) };
          },
          async assignTicket(input) {
            mutated = true;
            return { ticket: createTicket({ id: input.ticketId }) };
          },
          async addTicketComment(input) {
            mutated = true;
            return { commentId: "c1", ticketId: input.ticketId };
          },
          async changeTicketPriority(input) {
            mutated = true;
            return { ticket: createTicket({ id: input.ticketId, priority: input.priority }) };
          },
          async changeTicketStatus(input) {
            mutated = true;
            return { ticket: createTicket({ id: input.ticketId, status: input.status }) };
          },
        }),
      );

      const input =
        toolKey === "assign_ticket"
          ? { ticketId: "ticket-b", assigneeName: "Ahmed" }
          : toolKey === "add_ticket_comment"
            ? { ticketId: "ticket-b", body: "note" }
          : toolKey === "change_ticket_priority"
            ? { ticketId: "ticket-b", priority: "urgent" }
            : toolKey === "change_ticket_status"
              ? { ticketId: "ticket-b", status: "in_progress" }
              : toolKey === "update_ticket"
                ? { ticketId: "ticket-b", subject: "Hacked" }
                : { ticketId: "ticket-b" };

      const output = await tools[toolKey]!.execute(baseContext(), input);

      assert.equal(output.success, false);
      assert.equal(output.errorCode, "CUSTOMER_OWNERSHIP_DENIED");
      assert.deepEqual(output.errors, ["CUSTOMER_OWNERSHIP_DENIED"]);
      assert.equal(output.message, TICKET_CUSTOMER_OWNERSHIP_DENIED_MESSAGE);
      assert.equal(output.ticket, undefined);
      assert.equal(mutated, false);
    });

    it(`${toolKey}: missing trusted customer → CUSTOMER_CONTEXT_REQUIRED`, async () => {
      const tools = createTicketAgentTools(createStubPorts());
      const input =
        toolKey === "assign_ticket"
          ? { ticketId: "ticket-a", assigneeName: "Ahmed" }
          : toolKey === "add_ticket_comment"
            ? { ticketId: "ticket-a", body: "note" }
            : toolKey === "change_ticket_priority"
              ? { ticketId: "ticket-a", priority: "urgent" }
              : toolKey === "change_ticket_status"
                ? { ticketId: "ticket-a", status: "in_progress" }
                : toolKey === "update_ticket"
                  ? { ticketId: "ticket-a", subject: "Updated" }
                  : { ticketId: "ticket-a" };

      const output = await tools[toolKey]!.execute(baseContext({ trustedCustomerId: null }), input);

      assert.equal(output.success, false);
      assert.equal(output.errorCode, "CUSTOMER_CONTEXT_REQUIRED");
      assert.deepEqual(output.errors, ["CUSTOMER_CONTEXT_REQUIRED"]);
    });
  }

  it("attack: LLM supplies ticket-of-B + customerId B → DENIED, no mutation, no ticket details", async () => {
    let mutated = false;
    const tools = createTicketAgentTools(
      createStubPorts({
        async updateTicket() {
          mutated = true;
          return { ticket: createTicket({ id: "ticket-b", customerId: "customer-b", subject: "SECRET" }) };
        },
      }),
    );

    const output = await tools.update_ticket!.execute(baseContext(), {
      ticketId: "ticket-b",
      customerId: "customer-b",
      subject: "Hacked",
    });

    assert.equal(output.success, false);
    assert.equal(output.errorCode, "CUSTOMER_OWNERSHIP_DENIED");
    assert.equal(output.ticket, undefined);
    assert.equal(output.subject, undefined);
    assert.equal(mutated, false);
  });

  it("attack: customer A conversation + other-company ticketId → DENIED", async () => {
    const tools = createTicketAgentTools(
      createStubPorts({
        async getTicket() {
          return null;
        },
      }),
    );

    const output = await tools.close_ticket!.execute(baseContext({ companyId: "company-1" }), {
      ticketId: "ticket-from-company-b",
    });

    assert.equal(output.success, false);
    assert.equal(output.errorCode, "CUSTOMER_OWNERSHIP_DENIED");
    assert.equal(output.message, TICKET_CUSTOMER_OWNERSHIP_DENIED_MESSAGE);
    assert.equal(output.ticket, undefined);
  });
});
