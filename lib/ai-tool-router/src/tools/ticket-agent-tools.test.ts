import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TicketAgentToolPorts, TicketSummary } from "./ticket-agent-ports.js";
import { createTicketAgentTools, CREATE_TICKET_TOOL_KEY } from "./ticket-agent-tools.js";

function createTicket(overrides: Partial<TicketSummary> = {}): TicketSummary {
  return {
    id: "ticket-1",
    ticketNumber: "TKT-000001",
    subject: "Billing issue",
    description: "Payment failed",
    status: "open",
    priority: "high",
    customerId: null,
    conversationId: "conv-1",
    assignedUserId: null,
    assignedUserName: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
    ...overrides,
  };
}

function createStubPorts(overrides: Partial<TicketAgentToolPorts> = {}): TicketAgentToolPorts {
  return {
    async createTicket(input) {
      return {
        ticket: createTicket({
          subject: input.subject,
          priority: input.priority ?? "normal",
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
    async searchTickets() {
      return { tickets: [createTicket()], total: 1 };
    },
    ...overrides,
  };
}

describe("createTicketAgentTools", () => {
  it("creates a high priority ticket", async () => {
    const created: Array<Record<string, unknown>> = [];
    const tools = createTicketAgentTools(
      createStubPorts({
        async createTicket(input) {
          created.push(input);
          return {
            ticket: createTicket({ priority: input.priority ?? "normal", subject: input.subject }),
          };
        },
      }),
    );

    const output = await tools[CREATE_TICKET_TOOL_KEY]!.execute(
      {
        companyId: "company-1",
        conversationId: "conv-1",
        conversationState: "waiting_user",
        userId: "user-1",
      },
      { subject: "Payment failed", priority: "high", description: "Checkout error" },
    );

    assert.equal(output.success, true);
    assert.equal(created[0]?.priority, "high");
  });

  it("assigns ticket to Ahmed", async () => {
    const tools = createTicketAgentTools(createStubPorts());
    const output = await tools.assign_ticket!.execute(
      {
        companyId: "company-1",
        conversationId: "conv-1",
        conversationState: "waiting_user",
        userId: "user-1",
      },
      { ticketId: "ticket-1", assigneeName: "Ahmed" },
    );

    assert.equal(output.success, true);
    assert.equal(output.assignedUserName, "Ahmed");
  });

  it("closes ticket", async () => {
    const tools = createTicketAgentTools(createStubPorts());
    const output = await tools.close_ticket!.execute(
      {
        companyId: "company-1",
        conversationId: "conv-1",
        conversationState: "waiting_user",
        userId: "user-1",
      },
      { ticketId: "ticket-1", resolutionNote: "Resolved by AI" },
    );

    assert.equal(output.success, true);
    assert.equal(output.status, "closed");
  });

  it("adds internal note", async () => {
    const comments: Array<Record<string, unknown>> = [];
    const tools = createTicketAgentTools(
      createStubPorts({
        async addTicketComment(input) {
          comments.push(input);
          return { commentId: "comment-1", ticketId: input.ticketId };
        },
      }),
    );

    const output = await tools.add_ticket_comment!.execute(
      {
        companyId: "company-1",
        conversationId: "conv-1",
        conversationState: "waiting_user",
        userId: "user-1",
      },
      { ticketId: "ticket-1", body: "Escalated to billing", isInternal: true },
    );

    assert.equal(output.success, true);
    assert.equal(comments[0]?.isInternal, true);
  });

  it("requires authenticated user", async () => {
    const tools = createTicketAgentTools(createStubPorts());
    await assert.rejects(
      () =>
        tools.create_ticket!.execute(
          {
            companyId: "company-1",
            conversationId: "conv-1",
            conversationState: "waiting_user",
            userId: null,
          },
          { subject: "Test" },
        ),
      /authenticated user/i,
    );
  });
});
