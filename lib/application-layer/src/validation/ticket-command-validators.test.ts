import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateCommand } from "./command-validators.js";

describe("ticket command validators", () => {
  it("registers CreateTicket and related ticket mutations", () => {
    assert.doesNotThrow(() =>
      validateCommand("CreateTicket", { subject: "Billing issue" }),
    );
    assert.doesNotThrow(() =>
      validateCommand("UpdateTicket", { ticketId: "t1", subject: "Updated" }),
    );
    assert.doesNotThrow(() =>
      validateCommand("CloseTicket", { ticketId: "t1" }),
    );
    assert.doesNotThrow(() =>
      validateCommand("AssignTicket", { ticketId: "t1", assigneeUserId: "u1" }),
    );
    assert.doesNotThrow(() =>
      validateCommand("AddTicketComment", { ticketId: "t1", body: "note" }),
    );
    assert.doesNotThrow(() =>
      validateCommand("ChangeTicketPriority", { ticketId: "t1", priority: "high" }),
    );
    assert.doesNotThrow(() =>
      validateCommand("ChangeTicketStatus", { ticketId: "t1", status: "open" }),
    );
  });
});
