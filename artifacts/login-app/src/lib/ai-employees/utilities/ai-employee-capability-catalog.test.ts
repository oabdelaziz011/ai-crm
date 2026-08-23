import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROMPT_TEMPLATE_DEFAULT_TOOL_KEYS,
  WEBHOOK_STUB_TOOL_KEYS,
  clearAvailableToolKeys,
  groupAvailableToolsByCapability,
  intersectToolKeysWithAvailable,
  resolveAvailableEmployeeTools,
  resolveEntitledToolKeys,
  resolveRequiredFeatureCodesForTool,
  selectAllAvailableToolKeys,
  splitAssignedToolKeys,
  toggleAvailableToolKey,
} from "./ai-employee-capability-catalog.js";

const catalog = [
  { key: "search_customer", displayName: "Search Customers", category: "crm" },
  { key: "create_customer", displayName: "Create Customer", category: "crm" },
  { key: "update_customer", displayName: "Update Customer", category: "crm" },
  { key: "search_availability", displayName: "Search Availability", category: "scheduling" },
  { key: "create_booking", displayName: "Create Booking", category: "scheduling" },
  { key: "search_bookings", displayName: "Search Bookings", category: "scheduling" },
  { key: "reschedule_booking", displayName: "Reschedule Booking", category: "scheduling" },
  { key: "cancel_booking", displayName: "Cancel Booking", category: "scheduling" },
  { key: "check_in", displayName: "Check In", category: "scheduling" },
  { key: "check_out", displayName: "Check Out", category: "scheduling" },
  { key: "create_ticket", displayName: "Create Ticket", category: "support" },
  { key: "search_ticket", displayName: "Search Tickets", category: "support" },
  { key: "create_lead", displayName: "Create Lead", category: "sales" },
  { key: "search_lead", displayName: "Search Leads", category: "sales" },
  { key: "escalate_to_human", displayName: "Escalate To Human", category: "handoff" },
  { key: "queue_handoff", displayName: "Queue Handoff", category: "handoff" },
  { key: "return_to_ai", displayName: "Return To AI", category: "handoff" },
  { key: "knowledge_search", displayName: "Knowledge Search", category: "knowledge" },
  { key: "invoice_search", displayName: "Invoice Search", category: "billing" },
  { key: "transfer_to_workflow", displayName: "Transfer To Workflow", category: "automation" },
  { key: "knowledge_lookup", displayName: "Knowledge Lookup", category: "knowledge" },
];

describe("ai-employee-capability-catalog", () => {
  it("A. company with bookings: booking tools visible", () => {
    const tools = resolveAvailableEmployeeTools({
      enabledFeatureCodes: ["ai_employee", "bookings"],
      catalogTools: catalog,
      webhookFacing: false,
    });
    const keys = tools.map((tool) => tool.key);
    assert.ok(keys.includes("search_availability"));
    assert.ok(keys.includes("create_booking"));
    assert.ok(keys.includes("reschedule_booking"));
  });

  it("B. company without bookings: booking tools not visible", () => {
    const tools = resolveAvailableEmployeeTools({
      enabledFeatureCodes: ["ai_employee", "customers", "ticketing", "ai_ticketing"],
      catalogTools: catalog,
      webhookFacing: false,
    });
    const keys = tools.map((tool) => tool.key);
    assert.equal(keys.includes("create_booking"), false);
    assert.equal(keys.includes("search_availability"), false);
    assert.ok(keys.includes("search_customer"));
    assert.ok(keys.includes("create_ticket"));
  });

  it("C. company with ticketing: ticket tools visible", () => {
    const tools = resolveAvailableEmployeeTools({
      enabledFeatureCodes: ["ai_employee", "ticketing", "ai_ticketing"],
      catalogTools: catalog,
      webhookFacing: true,
    });
    const keys = tools.map((tool) => tool.key);
    assert.ok(keys.includes("create_ticket"));
    assert.ok(keys.includes("search_ticket"));
  });

  it("D. company without ticketing: ticket tools not visible", () => {
    const tools = resolveAvailableEmployeeTools({
      enabledFeatureCodes: ["ai_employee", "customers"],
      catalogTools: catalog,
      webhookFacing: true,
    });
    const keys = tools.map((tool) => tool.key);
    assert.equal(keys.includes("create_ticket"), false);
    assert.equal(keys.includes("search_ticket"), false);
  });

  it("ticketing alone without ai_ticketing does not unlock tickets", () => {
    const entitled = resolveEntitledToolKeys(["ai_employee", "ticketing"]);
    assert.equal(entitled.has("create_ticket"), false);
  });

  it("without ai_employee no commercial tools are entitled", () => {
    const entitled = resolveEntitledToolKeys(["customers", "bookings", "ticketing", "ai_ticketing"]);
    assert.equal(entitled.size, 0);
  });

  it("E. existing allowed_tool_keys split preserves unavailable assignments", () => {
    const available = ["search_customer", "create_ticket"];
    const allowed = ["search_customer", "cancel_booking", "create_lead"];
    const split = splitAssignedToolKeys(allowed, available);
    assert.deepEqual(split.availableSelected, ["search_customer"]);
    assert.deepEqual(split.unavailableAssigned, ["cancel_booking", "create_lead"]);
  });

  it("F. Select All only selects available tools", () => {
    const available = ["search_customer", "create_ticket"];
    const next = selectAllAvailableToolKeys(["cancel_booking"], available);
    assert.deepEqual(next.sort(), ["cancel_booking", "create_ticket", "search_customer"].sort());
  });

  it("G. Clear All removes available selections and keeps unavailable history", () => {
    const available = ["search_customer", "create_ticket"];
    const next = clearAvailableToolKeys(
      ["search_customer", "create_ticket", "cancel_booking"],
      available,
    );
    assert.deepEqual(next, ["cancel_booking"]);
  });

  it("G2. Clear All becomes empty when only available tools were selected", () => {
    const available = ["search_customer", "create_ticket"];
    const next = clearAvailableToolKeys(["search_customer", "create_ticket"], available);
    assert.deepEqual(next, []);
  });

  it("H. webhook-stub tools never appear on webhook capability surface", () => {
    const tools = resolveAvailableEmployeeTools({
      enabledFeatureCodes: ["ai_employee", "bookings", "leads", "omnichannel"],
      catalogTools: catalog,
      webhookFacing: true,
    });
    const keys = new Set(tools.map((tool) => tool.key));
    for (const stub of WEBHOOK_STUB_TOOL_KEYS) {
      assert.equal(keys.has(stub), false, stub);
    }
    assert.equal(keys.has("check_in"), true);
    assert.equal(keys.has("check_out"), true);
    assert.equal(keys.has("create_lead"), true);
    assert.equal(keys.has("search_lead"), true);
    assert.equal(keys.has("escalate_to_human"), true);
    assert.equal(keys.has("queue_handoff"), true);
    assert.equal(keys.has("return_to_ai"), true);
    assert.ok(keys.has("create_booking"));
    assert.ok(keys.has("search_availability"));
    assert.ok(keys.has("search_bookings"));
    assert.ok(keys.has("reschedule_booking"));
    assert.ok(keys.has("cancel_booking"));
  });

  it("H2. dashboard surface can show reschedule when bookings entitled", () => {
    const tools = resolveAvailableEmployeeTools({
      enabledFeatureCodes: ["ai_employee", "bookings"],
      catalogTools: catalog,
      webhookFacing: false,
    });
    const keys = tools.map((tool) => tool.key);
    assert.ok(keys.includes("reschedule_booking"));
    assert.ok(keys.includes("cancel_booking"));
  });

  it("I. type defaults are intersected with available company capabilities", () => {
    const available = resolveAvailableEmployeeTools({
      enabledFeatureCodes: ["ai_employee", "customers", "ticketing", "ai_ticketing"],
      catalogTools: catalog,
      webhookFacing: true,
    }).map((tool) => tool.key);
    const selected = intersectToolKeysWithAvailable(
      PROMPT_TEMPLATE_DEFAULT_TOOL_KEYS.support,
      available,
    );
    assert.ok(selected.includes("search_customer"));
    assert.ok(selected.includes("create_ticket"));
    assert.equal(selected.includes("create_booking"), false);
  });

  it("J. unmapped tools like knowledge_lookup are never exposed", () => {
    const tools = resolveAvailableEmployeeTools({
      enabledFeatureCodes: ["ai_employee", "customers", "bookings", "ticketing", "ai_ticketing"],
      catalogTools: catalog,
      webhookFacing: false,
    });
    assert.equal(tools.some((tool) => tool.key === "knowledge_lookup"), false);
  });

  it("toggle never grants tools outside available set", () => {
    const available = ["search_customer"];
    const next = toggleAvailableToolKey(["search_customer"], available, "create_booking", true);
    assert.deepEqual(next, ["search_customer"]);
  });

  it("groups tools by business capability for wizard UX", () => {
    const tools = resolveAvailableEmployeeTools({
      enabledFeatureCodes: ["ai_employee", "customers", "bookings"],
      catalogTools: catalog,
      webhookFacing: true,
    });
    const groups = groupAvailableToolsByCapability(tools);
    assert.ok(groups.some((group) => group.group === "customers"));
    assert.ok(groups.some((group) => group.group === "bookings"));
    assert.equal(groups.some((group) => group.group === "sales"), false);
  });

  it("Phase 2 reverse map: create_booking requires ai_employee + bookings", () => {
    assert.deepEqual(resolveRequiredFeatureCodesForTool("create_booking"), [
      "ai_employee",
      "bookings",
    ]);
  });

  it("Phase 2 reverse map: ticket tools require dual gate", () => {
    assert.deepEqual(resolveRequiredFeatureCodesForTool("create_ticket"), [
      "ai_employee",
      "ticketing",
      "ai_ticketing",
    ]);
  });

  it("Phase 2 reverse map: unmapped tool returns null", () => {
    assert.equal(resolveRequiredFeatureCodesForTool("knowledge_lookup"), null);
  });
});
