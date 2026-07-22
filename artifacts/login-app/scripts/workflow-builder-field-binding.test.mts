import assert from "node:assert/strict";
import { registerBuiltInWorkflowNodes } from "../src/workflow-builder/core/register-built-in-nodes";
import { getWorkflowNodeDefinition } from "../src/workflow-builder/core/node-registry";
import {
  createDefaultCreateBookingConfig,
  normalizeCreateBookingNodeConfig,
  validateCreateBookingConfig,
} from "../src/workflow-builder/core/crm/create-booking-config";
import { mapDocumentToPersistence, mapFlowToDocument } from "../src/workflow-builder/core/persistence/workflow-mapper";
import { staticBinding, variableBinding } from "@workspace/automation-platform";
import type {
  AutomationEdgeRecord,
  AutomationFlowRecord,
  AutomationNodeRecord,
} from "@workspace/automation-platform";

registerBuiltInWorkflowNodes();

console.log("\nWorkflow builder field binding audit\n");

const definition = getWorkflowNodeDefinition("create_booking");

assert.ok(definition.PropertyEditor);
assert.deepEqual(createDefaultCreateBookingConfig().service, staticBinding("Consultation"));

const legacy = normalizeCreateBookingNodeConfig({
  builderType: "create_booking",
  action: "create_booking",
  serviceName: "Consultation",
  dateField: "booking_date",
});
assert.deepEqual(legacy.service, staticBinding("Consultation"));
assert.deepEqual(legacy.appointmentDate, variableBinding("booking_date"));

const invalidIssues = validateCreateBookingConfig(createDefaultCreateBookingConfig(), "node-1");
assert.ok(invalidIssues.length > 0, "default config should require doctor, location, time, etc.");

const validConfig = {
  ...createDefaultCreateBookingConfig(),
  doctor: variableBinding("doctor_id"),
  location: staticBinding("main"),
  appointmentTime: variableBinding("appointment_time"),
};
assert.equal(validateCreateBookingConfig(validConfig, "node-1").length, 0);

const flow: AutomationFlowRecord = {
  id: "flow-1",
  company_id: "company-1",
  name: "Booking flow",
  description: "",
  trigger_type: "inbound_message",
  status: "draft",
  version: 1,
  metadata: {},
  active_version_id: null,
  has_unpublished_draft: true,
  created_by: null,
  updated_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
  deleted_by: null,
};
const nodes: AutomationNodeRecord[] = [
  {
    id: "node-1",
    flow_id: "flow-1",
    type: "action",
    config: definition.toEngineConfig(validConfig),
    position_x: 0,
    position_y: 0,
    created_at: new Date().toISOString(),
  },
];
const edges: AutomationEdgeRecord[] = [];
const document = mapFlowToDocument(flow, nodes, edges);
const restored = document.nodes[0]?.config;
assert.deepEqual(restored?.service, staticBinding("Consultation"));
assert.deepEqual(restored?.doctor, variableBinding("doctor_id"));

const persisted = mapDocumentToPersistence(document);
assert.equal(persisted.nodes[0]?.config.action, "create_booking");
assert.ok(persisted.nodes[0]?.config.service);

console.log("PASS field binding + create booking builder persistence");
