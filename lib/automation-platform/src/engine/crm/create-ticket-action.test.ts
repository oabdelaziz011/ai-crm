import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { staticBinding, variableBinding } from "../../field-binding/normalize.js";
import { coerceBindingStringValue } from "../../field-binding/resolver.js";
import { executeCreateTicketAction } from "./create-ticket-action.js";
import type { ExecutionContext } from "../execution-context.js";
import type { AutomationTicketSummary, TicketServicePort } from "../../ports/ticket-service-port.js";

function createTicketSummary(overrides: Partial<AutomationTicketSummary> = {}): AutomationTicketSummary {
  return {
    id: "t1",
    ticketNumber: "TKT-1",
    subject: "Subject",
    description: "",
    status: "open",
    priority: "normal",
    customerId: null,
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

describe("executeCreateTicketAction", () => {
  it("resolves subject/description/priority from field bindings and AI decision", async () => {
    const created: Array<Record<string, unknown>> = [];
    const ticketService: TicketServicePort = {
      async createTicket(input) {
        created.push(input as unknown as Record<string, unknown>);
        return {
          ticket: createTicketSummary({
            subject: input.subject,
            priority: input.priority ?? "normal",
            customerId: input.customerId ?? null,
            conversationId: input.conversationId ?? null,
          }),
        };
      },
      async assignTicket() {
        throw new Error("not used");
      },
      async findTicket() {
        throw new Error("not used");
      },
    };

    const result = await executeCreateTicketAction(
      createContext({
        ticket_subject: "Payment issue",
        ticket_description: "Card declined",
        decision_result: { value: { label: "urgent", confidence: 0.91 } },
      }),
      {
        subject: variableBinding("ticket_subject"),
        description: variableBinding("ticket_description"),
        priority: variableBinding("decision_result"),
      },
      ticketService,
    );

    assert.equal(result.outcome, "continue");
    assert.equal(created[0]?.subject, "Payment issue");
    assert.equal(created[0]?.description, "Card declined");
    assert.equal(created[0]?.priority, "urgent");
  });

  it("migrates legacy subjectField config at runtime", async () => {
    const created: Array<Record<string, unknown>> = [];
    const ticketService: TicketServicePort = {
      async createTicket(input) {
        created.push(input as unknown as Record<string, unknown>);
        return {
          ticket: createTicketSummary({
            id: "t2",
            ticketNumber: "TKT-2",
            subject: input.subject,
            priority: input.priority ?? "normal",
          }),
        };
      },
      async assignTicket() {
        throw new Error("not used");
      },
      async findTicket() {
        throw new Error("not used");
      },
    };

    await executeCreateTicketAction(
      createContext({ ticket_subject: "Legacy subject" }),
      {
        subjectField: "ticket_subject",
        descriptionField: "",
        priority: "high",
      },
      ticketService,
    );

    assert.equal(created[0]?.subject, "Legacy subject");
    assert.equal(created[0]?.priority, "high");
  });

  it("passes customer id from customer binding into createTicket", async () => {
    const created: Array<Record<string, unknown>> = [];
    const ticketService: TicketServicePort = {
      async createTicket(input) {
        created.push(input as unknown as Record<string, unknown>);
        return {
          ticket: createTicketSummary({
            ticketNumber: "TKT-99",
            customerId: input.customerId ?? null,
          }),
        };
      },
      async assignTicket() {
        throw new Error("not used");
      },
      async findTicket() {
        throw new Error("not used");
      },
    };

    const context = createContext({ found_customer_id: "cust-from-find" });
    context.customer = { id: null } as ExecutionContext["customer"];

    const result = await executeCreateTicketAction(
      context,
      {
        subject: staticBinding("Complaint"),
        customer: variableBinding("found_customer_id"),
      },
      ticketService,
    );

    assert.equal(created[0]?.customerId, "cust-from-find");
    assert.equal(result.variables?.ticket_number, "TKT-99");
    assert.equal((result.variables?.ticket as { ticketNumber?: string })?.ticketNumber, "TKT-99");
  });
});

describe("coerceBindingStringValue for AI decision", () => {
  it("reads nested decision label", () => {
    assert.equal(coerceBindingStringValue({ value: { label: "high", confidence: 0.8 } }), "high");
  });
});
