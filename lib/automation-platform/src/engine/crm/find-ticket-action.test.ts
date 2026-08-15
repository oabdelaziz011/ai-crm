import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { variableBinding } from "../../field-binding/normalize.js";
import { executeFindTicketAction } from "./find-ticket-action.js";
import type { ExecutionContext } from "../execution-context.js";
import type { AutomationTicketSummary, TicketServicePort } from "../../ports/ticket-service-port.js";

function createTicketSummary(overrides: Partial<AutomationTicketSummary> = {}): AutomationTicketSummary {
  return {
    id: "t1",
    ticketNumber: "TKT-000005",
    subject: "عاجل SLA",
    description: "تفاصيل الشكوى",
    status: "open",
    priority: "urgent",
    customerId: "c1",
    conversationId: null,
    assignedUserId: null,
    assignedUserName: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createContext(variables: Record<string, unknown>): ExecutionContext {
  return {
    company: { id: "company-1" },
    customer: { id: "customer-1" },
    run: { metadata: { actorUserId: "user-1" } },
    session: { metadata: {} },
    variables,
    currentNode: { id: "n1", type: "action", config: {} },
    nodes: [],
    edges: [],
  } as unknown as ExecutionContext;
}

describe("executeFindTicketAction", () => {
  it("loads ticket details when the number exists", async () => {
    const ticketService: TicketServicePort = {
      async createTicket() {
        throw new Error("not used");
      },
      async assignTicket() {
        throw new Error("not used");
      },
      async findTicket(input) {
        assert.equal(input.ticketNumber, "TKT-000005");
        return { status: "found", ticket: createTicketSummary() };
      },
    };

    const result = await executeFindTicketAction(
      createContext({ complaint_number: "TKT-000005" }),
      { ticketNumber: variableBinding("complaint_number") },
      ticketService,
    );

    assert.equal(result.outcome, "continue");
    assert.equal(result.variables.ticket_found, true);
    assert.equal((result.variables.ticket as { subject?: string }).subject, "عاجل SLA");
    assert.equal((result.variables.lookup as { status?: string }).status, "found");
  });

  it("marks not_found when the ticket number is missing", async () => {
    const ticketService: TicketServicePort = {
      async createTicket() {
        throw new Error("not used");
      },
      async assignTicket() {
        throw new Error("not used");
      },
      async findTicket() {
        return { status: "not_found", ticket: null };
      },
    };

    const result = await executeFindTicketAction(
      createContext({ complaint_number: "TKT-999999" }),
      { ticketNumber: variableBinding("complaint_number") },
      ticketService,
    );

    assert.equal(result.variables.ticket_found, false);
    assert.equal((result.variables.ticket as { exists?: boolean }).exists, false);
    assert.equal((result.variables.lookup as { status?: string }).status, "not_found");
  });
});
