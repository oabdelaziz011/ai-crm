import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { staticBinding, variableBinding } from "../field-binding/normalize.js";
import { normalizeCreateTicketConfig } from "./create-ticket-config.js";

describe("create ticket config", () => {
  it("migrates legacy subject/description/priority fields into bindings", () => {
    const migrated = normalizeCreateTicketConfig({
      subjectField: "ticket_subject",
      descriptionField: "ticket_description",
      priorityField: "decision_result.value.label",
      subject: "",
      description: "",
      priority: "normal",
    });

    assert.deepEqual(migrated.subject, variableBinding("ticket_subject"));
    assert.deepEqual(migrated.description, variableBinding("ticket_description"));
    assert.deepEqual(migrated.priority, variableBinding("decision_result.value.label"));
  });

  it("prefers static subject over subjectField when both are set", () => {
    const migrated = normalizeCreateTicketConfig({
      subject: "Payment failed",
      subjectField: "ticket_subject",
      priority: "high",
    });

    assert.deepEqual(migrated.subject, staticBinding("Payment failed"));
    assert.deepEqual(migrated.priority, staticBinding("high"));
  });

  it("keeps structured bindings as-is", () => {
    const config = {
      subject: variableBinding("ticket_subject"),
      description: staticBinding("Details"),
      priority: variableBinding("decision_result.value.label"),
      customer: variableBinding("customer.id"),
    };
    const migrated = normalizeCreateTicketConfig(config);
    assert.deepEqual(migrated.subject, config.subject);
    assert.deepEqual(migrated.description, config.description);
    assert.deepEqual(migrated.priority, config.priority);
    assert.deepEqual(migrated.customer, config.customer);
  });

  it("defaults customer binding to customer.id", () => {
    const migrated = normalizeCreateTicketConfig({
      subject: variableBinding("ticket_subject"),
    });
    assert.deepEqual(migrated.customer, variableBinding("customer.id"));
  });
});
