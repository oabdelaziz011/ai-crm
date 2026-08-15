import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectObjectFieldRequirements,
  validateNodeVariableContract,
  validateObjectFieldRequirements,
} from "./workflow-variable-contracts.js";

describe("workflow variable contracts", () => {
  it("collects object field requirements from mustache and dotted bindings", () => {
    const requirements = collectObjectFieldRequirements({
      action: "create_booking",
      appointmentTime: { mode: "variable", variable: "{{selected_slot.display_time}}" },
      doctor: { mode: "variable", variable: "selected_slot.resource_id" },
      service: { mode: "variable", variable: "{{selected_service.id}}" },
    });

    const byVariable = Object.fromEntries(
      requirements.map((requirement) => [requirement.variable, requirement.fields.sort()]),
    );
    assert.deepEqual(byVariable.selected_slot?.sort(), ["display_time", "resource_id"]);
    assert.deepEqual(byVariable.selected_service, ["id"]);
  });

  it("fails when a required object variable is a bare string", () => {
    const result = validateObjectFieldRequirements(
      { selected_slot: "2026-08-05" },
      [{ variable: "selected_slot", fields: ["display_time", "start_at"] }],
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.violations[0]?.actualKind, "string");
    assert.match(result.userMessage, /ناقصة|incomplete/i);
  });

  it("passes when the slot object includes required fields", () => {
    const result = validateNodeVariableContract({
      nodeType: "action",
      config: {
        action: "create_booking",
        appointmentTime: { mode: "variable", variable: "{{selected_slot.start_at}}" },
        doctor: { mode: "variable", variable: "{{selected_slot.resource_id}}" },
      },
      variables: {
        selected_slot: {
          start_at: "2026-08-05T10:00:00.000Z",
          display_time: "10:00 AM",
          resource_id: "res-1",
          service_id: "svc-1",
        },
      },
    });
    assert.equal(result.ok, true);
  });

  it("passes create_booking when selected_slot supplies service for legacy booking.service binding", () => {
    const result = validateNodeVariableContract({
      nodeType: "action",
      config: {
        action: "create_booking",
        service: { mode: "variable", variable: "{{booking.service}}" },
        doctor: { mode: "variable", variable: "{{selected_slot.resource_id}}" },
        appointmentTime: { mode: "variable", variable: "{{selected_slot.start_at}}" },
      },
      variables: {
        selected_slot: {
          start_at: "2026-08-10T13:30:00.000Z",
          display_time: "1:30 PM",
          resource_id: "res-1",
          service_id: "svc-1",
        },
        selected_service: { id: "svc-1", name: "Clinic" },
      },
    });
    assert.equal(result.ok, true);
  });

  it("does not treat AI nodeKey strings like ai.decision as variable bindings", () => {
    const requirements = collectObjectFieldRequirements({
      action: "ai_workflow",
      aiNodeKey: "ai.decision",
      aiConfig: {
        nodeKey: "ai.decision",
        metadata: { decision: { inputVariable: "lastMessage" } },
      },
    });
    assert.deepEqual(requirements, []);

    const result = validateNodeVariableContract({
      nodeType: "action",
      config: {
        action: "ai_workflow",
        aiNodeKey: "ai.decision",
        aiConfig: { nodeKey: "ai.extract" },
      },
      variables: {},
    });
    assert.equal(result.ok, true);
  });
});
