/**
 * Workflow Builder trigger configuration unit tests.
 * Run: pnpm --dir artifacts/login-app test:workflow-builder-triggers
 */
import assert from "node:assert/strict";
import { registerBuiltInWorkflowNodes } from "../src/workflow-builder/core/register-built-in-nodes";
import { registerBuiltInVariableProviders } from "../src/workflow-builder/core/variables/built-in-variable-providers";
import { resetMetadataExtensionsForTests } from "../src/workflow-builder/core/persistence/metadata-extension-registry";
import { resetDocumentValidationExtensionsForTests } from "../src/workflow-builder/core/validation/validation-extension-registry";
import { resetNodePropertyEditorOverridesForTests } from "../src/workflow-builder/core/node-property-editor-registry";
import { createBuilderNode } from "../src/workflow-builder/core/persistence/workflow-mapper";
import { mapDocumentToPersistence, mapFlowToDocument } from "../src/workflow-builder/core/persistence/workflow-mapper";
import { validateWorkflow } from "../src/workflow-builder/core/validation/workflow-validator";
import {
  applyCatalogSelection,
  getTriggerCatalogEntry,
  listTriggerCatalogEntries,
  resolveDefaultTriggerConfiguration,
  searchTriggerCatalog,
} from "../src/workflow-builder/triggers/adapters/trigger-registry-adapter";
import { aggregateTriggerAnalytics } from "../src/workflow-builder/triggers/repositories/trigger-analytics-repository";
import {
  buildTriggerPreviewModel,
  buildTriggerReadinessModel,
} from "../src/workflow-builder/triggers/selectors/trigger-selectors";
import { TriggerConfigurationService } from "../src/workflow-builder/triggers/services/trigger-configuration-service";
import { registerTriggerPlatform, resetTriggerPlatformRegistrationForTests } from "../src/workflow-builder/triggers/register-trigger-platform";
import { buildTriggerTestPayload } from "../src/workflow-builder/triggers/utilities/trigger-test-payload-utils";
import { hasChannelBinding } from "../src/workflow-builder/triggers/utilities/trigger-channel-binding-utils";
import {
  TRIGGER_CONFIG_EXTENSION_KEY,
  readTriggerConfig,
  withTriggerConfigExtension,
} from "../src/workflow-builder/triggers/utilities/trigger-config-utils";
import { collectTriggerValidationIssues } from "../src/workflow-builder/triggers/utilities/trigger-validation-utils";
import { computeWorkflowDocumentFingerprint } from "../src/workflow-builder/simulation/utilities/simulation-document-fingerprint";

function resetTriggerModulesForTests() {
  resetDocumentValidationExtensionsForTests();
  resetMetadataExtensionsForTests();
  resetNodePropertyEditorOverridesForTests();
  resetTriggerPlatformRegistrationForTests();
}

resetTriggerModulesForTests();
registerBuiltInWorkflowNodes();
registerBuiltInVariableProviders();
registerTriggerPlatform();

console.log("\nWorkflow Builder trigger configuration tests\n");

const baseDocument = {
  flowId: "flow-trigger-1",
  companyId: "company-1",
  name: "Trigger journey",
  description: "",
  triggerType: "inbound_message" as const,
  status: "draft" as const,
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [createBuilderNode("start", { x: 0, y: 0 }, "start-1"), createBuilderNode("end", { x: 0, y: 240 }, "end-1")],
  edges: [],
};

assert.equal(listTriggerCatalogEntries().length, 21);
assert.ok(getTriggerCatalogEntry("whatsapp").requiresChannelBinding);
assert.equal(getTriggerCatalogEntry("schedule").classification, "configuration_only");
assert.equal(getTriggerCatalogEntry("manual").classification, "executable");
console.log("  ✓ trigger registry adapter exposes catalog with classifications");

const searched = searchTriggerCatalog("payment");
assert.ok(searched.some((entry) => entry.id === "payment_received"));
console.log("  ✓ trigger catalog search filters entries");

const selection = applyCatalogSelection("booking_created");
assert.equal(selection.triggerType, "api_event");
assert.equal(selection.triggerConfig.businessEvent, "booking.created");
console.log("  ✓ catalog selection maps to platform trigger type and metadata");

const service = new TriggerConfigurationService();
const configuredDocument = withTriggerConfigExtension(baseDocument, selection.triggerConfig);
const preview = service.preview({
  ...configuredDocument,
  triggerType: selection.triggerType,
});
assert.equal(preview.catalogId, "booking_created");
assert.ok(preview.payload.booking);
console.log("  ✓ trigger preview builds read-only payload without execution");

const testPayload = buildTriggerTestPayload(
  configuredDocument,
  selection.triggerConfig,
  getTriggerCatalogEntry("booking_created"),
);
assert.ok(testPayload.initialVariables["booking.id"]);
assert.equal(testPayload.initialVariables.__trigger, "appointment_created");
console.log("  ✓ trigger test payload seeds simulation variables only");

const configOnlyIssues = collectTriggerValidationIssues(
  withTriggerConfigExtension(baseDocument, { catalogId: "schedule", cronExpression: "", timezone: "UTC" }),
  {},
);
assert.ok(configOnlyIssues.some((issue) => issue.id === "trigger-configuration-only"));
assert.ok(configOnlyIssues.some((issue) => issue.id === "trigger-missing-cron"));
console.log("  ✓ trigger validation reports configuration-only and missing fields");

const channelIssuesWithoutBindings = collectTriggerValidationIssues(
  withTriggerConfigExtension(baseDocument, applyCatalogSelection("whatsapp").triggerConfig),
  {},
);
assert.ok(!channelIssuesWithoutBindings.some((issue) => issue.id === "trigger-missing-channel-binding"));
console.log("  ✓ structural validation skips channel binding when bindings are unavailable");

const channelIssuesWithBindings = collectTriggerValidationIssues(
  withTriggerConfigExtension(baseDocument, applyCatalogSelection("whatsapp").triggerConfig),
  { channelBindings: [{ channel: "whatsapp", isEnabled: true }] },
);
assert.ok(!channelIssuesWithBindings.some((issue) => issue.id === "trigger-missing-channel-binding"));
console.log("  ✓ contextual validation accepts matching channel bindings");

const channelIssuesMissingBinding = collectTriggerValidationIssues(
  withTriggerConfigExtension(baseDocument, applyCatalogSelection("whatsapp").triggerConfig),
  { channelBindings: [] },
);
assert.ok(channelIssuesMissingBinding.some((issue) => issue.id === "trigger-missing-channel-binding"));
console.log("  ✓ contextual validation detects missing channel binding");

assert.equal(hasChannelBinding([{ channel: "whatsapp", isEnabled: true }], "whatsapp"), true);
assert.equal(hasChannelBinding([], "whatsapp"), false);
console.log("  ✓ channel binding helper resolves messaging readiness");

const readiness = buildTriggerReadinessModel(
  withTriggerConfigExtension(baseDocument, applyCatalogSelection("manual").triggerConfig),
  [],
  true,
  true,
);
assert.ok(readiness.score >= 50);
assert.equal(readiness.classification, "executable");
console.log("  ✓ readiness score derives from configuration and permissions");

const configOnlyReadiness = buildTriggerReadinessModel(
  withTriggerConfigExtension(baseDocument, {
    catalogId: "schedule",
    cronExpression: "0 9 * * *",
    timezone: "UTC",
  }),
  [],
  true,
  true,
);
assert.equal(configOnlyReadiness.classification, "configuration_only");
assert.ok(configOnlyReadiness.score <= 75);
console.log("  ✓ configuration-only triggers cap readiness score");

const analytics = aggregateTriggerAnalytics([
  {
    id: "run-1",
    company_id: "company-1",
    flow_id: "flow-trigger-1",
    status: "completed",
    trigger_source: "manual_start",
    started_at: "2026-01-01T10:00:00.000Z",
    finished_at: "2026-01-01T10:00:05.000Z",
    error_message: null,
    metadata: {},
    flow_version_id: null,
    current_node_id: null,
    session_id: null,
    variables: {},
  },
  {
    id: "run-2",
    company_id: "company-1",
    flow_id: "flow-trigger-1",
    status: "failed",
    trigger_source: "manual_start",
    started_at: "2026-01-01T11:00:00.000Z",
    finished_at: "2026-01-01T11:00:01.000Z",
    error_message: "boom",
    metadata: {},
    flow_version_id: null,
    current_node_id: null,
    session_id: null,
    variables: {},
  },
]);
assert.equal(analytics.executions, 2);
assert.equal(analytics.failures, 1);
assert.equal(analytics.averageLatencyMs, 3000);
console.log("  ✓ trigger analytics aggregates AutomationRunRepository records");

const persisted = mapDocumentToPersistence(
  withTriggerConfigExtension(baseDocument, applyCatalogSelection("payment_received").triggerConfig),
);
assert.ok(persisted.metadata[TRIGGER_CONFIG_EXTENSION_KEY]);
console.log("  ✓ trigger configuration persists in flow metadata JSON");

const restored = mapFlowToDocument(
  {
    id: baseDocument.flowId,
    company_id: baseDocument.companyId,
    name: baseDocument.name,
    description: baseDocument.description,
    trigger_type: "api_event",
    status: "draft",
    metadata: persisted.metadata,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    deleted_by: null,
    created_by: null,
    updated_by: null,
    active_version_id: null,
  },
  [],
  [],
);
assert.equal(readTriggerConfig(restored)?.catalogId, "payment_received");
console.log("  ✓ trigger configuration restores from flow metadata");

const publishIssues = validateWorkflow(
  withTriggerConfigExtension(baseDocument, applyCatalogSelection("whatsapp").triggerConfig),
);
assert.ok(!publishIssues.some((issue) => issue.id === "trigger-missing-channel-binding"));
console.log("  ✓ publish validation uses structural pipeline without binding false positives");

const contextualIssues = service.validateWorkflow(
  withTriggerConfigExtension(baseDocument, applyCatalogSelection("whatsapp").triggerConfig),
  [],
);
assert.ok(contextualIssues.some((issue) => issue.id === "trigger-missing-channel-binding"));
console.log("  ✓ contextual workflow validation includes binding checks when bindings are provided");

const defaultConfig = resolveDefaultTriggerConfiguration(baseDocument);
assert.equal(defaultConfig.catalogId, "inbound_message");
console.log("  ✓ default trigger configuration resolves from platform trigger type");

const fingerprintA = computeWorkflowDocumentFingerprint(baseDocument);
const fingerprintB = computeWorkflowDocumentFingerprint(
  withTriggerConfigExtension(baseDocument, applyCatalogSelection("manual").triggerConfig),
);
assert.notEqual(fingerprintA, fingerprintB);
console.log("  ✓ simulation fingerprint includes trigger configuration extensions");

console.log("\nAll workflow builder trigger configuration tests passed.\n");
