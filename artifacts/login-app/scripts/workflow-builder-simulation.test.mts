/**
 * Workflow Builder simulation unit tests.
 * Run: pnpm --dir artifacts/login-app test:workflow-builder-simulation
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { INTERACTIVE_SELECTION_INPUT_KEY } from "@workspace/automation-platform";
import { documentToSnapshot } from "../src/workflow-builder/core/lifecycle/snapshot-mapper";
import { createBuilderNode } from "../src/workflow-builder/core/persistence/workflow-mapper";
import { registerBuiltInWorkflowNodes } from "../src/workflow-builder/core/register-built-in-nodes";
import { createEdgeFromNodes } from "../src/workflow-builder/core/state/builder-reducer";
import { registerBuiltInVariableProviders } from "../src/workflow-builder/core/variables/built-in-variable-providers";
import { SimulationSessionRepository } from "../src/workflow-builder/simulation/repositories/simulation-session-repository";
import { buildSimulationReport, filterSimulationTimeline } from "../src/workflow-builder/simulation/selectors/simulation-selectors";
import {
  mapSimulationTimelineToActivityEvents,
  mapSimulationTimelineToViewModels,
} from "../src/workflow-builder/simulation/selectors/simulation-timeline-selectors";
import { executeSimulationNode } from "../src/workflow-builder/simulation/services/simulation-node-executor";
import { SimulationService } from "../src/workflow-builder/simulation/services/simulation-service";
import {
  computeWorkflowDocumentFingerprint,
  hasWorkflowDocumentDrift,
} from "../src/workflow-builder/simulation/utilities/simulation-document-fingerprint";
import { snapshotToRuntimeGraph } from "../src/workflow-builder/simulation/utilities/simulation-graph";
import {
  createIdleSimulationSnapshot,
  freezeSimulationSnapshot,
} from "../src/workflow-builder/simulation/utilities/simulation-snapshot-utils";

registerBuiltInWorkflowNodes();
registerBuiltInVariableProviders();

console.log("\nWorkflow Builder simulation tests\n");

function buildLinearDocument(flowId: string, companyId: string, middleNode: ReturnType<typeof createBuilderNode>) {
  const start = createBuilderNode("start", { x: 0, y: 0 }, "start-1");
  const end = createBuilderNode("end", { x: 0, y: 240 }, "end-1");
  return {
    flowId,
    companyId,
    name: "Simulation journey",
    description: "",
    triggerType: "inbound_message" as const,
    status: "draft" as const,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [start, middleNode, end],
    edges: [createEdgeFromNodes("start-1", middleNode.id), createEdgeFromNodes(middleNode.id, "end-1")],
  };
}

const start = createBuilderNode("start", { x: 0, y: 0 }, "start-1");
const message = createBuilderNode("send_message", { x: 0, y: 120 }, "msg-1");
message.config = { message: "Hello {{customer.name}}" };
const end = createBuilderNode("end", { x: 0, y: 240 }, "end-1");

const document = {
  flowId: "flow-sim-1",
  companyId: "company-1",
  name: "Simulation journey",
  description: "",
  triggerType: "inbound_message" as const,
  status: "draft" as const,
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [start, message, end],
  edges: [createEdgeFromNodes("start-1", "msg-1"), createEdgeFromNodes("msg-1", "end-1")],
};

const service = new SimulationService(new SimulationSessionRepository());
const snapshot = service.start(document, { autoAdvance: true });

assert.equal(snapshot.status, "completed");
assert.equal(snapshot.companyId, "company-1");
assert.ok(snapshot.pathExplorer.filter((entry) => entry.status === "executed").length >= 3);
assert.ok(snapshot.timeline.some((entry) => entry.type === "node_entered"));
assert.ok(snapshot.report);
assert.equal(snapshot.report?.executedNodeCount, 3);
console.log("  ✓ simulation service dry-runs a connected workflow");

const pausedService = new SimulationService(new SimulationSessionRepository());
const pausedSnapshot = pausedService.start(document, {
  autoAdvance: true,
  breakpoints: ["msg-1"],
});
assert.equal(pausedSnapshot.status, "paused");
assert.equal(pausedSnapshot.currentNodeId, "msg-1");
console.log("  ✓ breakpoints pause simulation before node execution");

const stepped = pausedService.step(document.companyId, document.flowId);
assert.ok(stepped.pathExplorer.find((entry) => entry.nodeId === "msg-1")?.status === "executed");
console.log("  ✓ manual step advances the simulation");

const timeline = filterSimulationTimeline(stepped.timeline, "nodes");
assert.ok(timeline.every((entry) => entry.type === "node_entered" || entry.type === "node_exited"));
console.log("  ✓ timeline filters isolate node events");

const report = buildSimulationReport({
  durationMs: 120,
  nodes: [],
  executedNodeIds: ["start-1", "msg-1", "end-1"],
  skippedNodeIds: [],
  validationIssues: [],
  simulationErrors: [],
  timeline: stepped.timeline,
  variables: stepped.variables,
});
assert.equal(report.coveragePercent, 0);
assert.ok(report.readinessScore >= 0);
console.log("  ✓ report generator produces export-ready metrics");

const frozen = freezeSimulationSnapshot(snapshot);
assert.throws(() => {
  (frozen as { status: string }).status = "running";
});
assert.throws(() => {
  frozen.variables.customer = "mutated";
});
assert.throws(() => {
  frozen.timeline[0]!.label = "mutated";
});
assert.throws(() => {
  frozen.stateInspector.executionContext.mutated = true;
});
assert.throws(() => {
  frozen.pathExplorer[0]!.label = "mutated";
});
console.log("  ✓ simulation snapshots are deeply immutable");

const activityEvents = mapSimulationTimelineToActivityEvents({
  entries: snapshot.timeline,
  companyId: document.companyId,
  flowId: document.flowId,
});
assert.ok(activityEvents.every((event) => event.metadata.simulation === true));
assert.ok(activityEvents.every((event) => event.metadata.productionTelemetryBlocked === true));

const timelineCards = mapSimulationTimelineToViewModels(snapshot.timeline, {
  companyId: document.companyId,
  flowId: document.flowId,
});
assert.ok(timelineCards.every((card) => card.isSimulationPreview));
console.log("  ✓ simulation timeline integrates activity-timeline mapping in UI view models");

const tenantRepository = new SimulationSessionRepository();
const tenantService = new SimulationService(tenantRepository);

const tenantADocument = { ...document, flowId: "shared-flow-id", companyId: "tenant-a" };
const tenantBDocument = { ...document, flowId: "shared-flow-id", companyId: "tenant-b" };

tenantService.start(tenantADocument, { autoAdvance: false, breakpoints: ["msg-1"] });
tenantService.toggleBreakpoint(tenantBDocument.companyId, tenantBDocument.flowId, "msg-1");

assert.equal(tenantRepository.getPendingBreakpoints("tenant-a", "shared-flow-id").length, 0);
assert.equal(tenantRepository.getPendingBreakpoints("tenant-b", "shared-flow-id").includes("msg-1"), true);
assert.equal(tenantRepository.getSession("tenant-a", "shared-flow-id")?.status, "running");
assert.equal(tenantRepository.getSession("tenant-b", "shared-flow-id"), null);
console.log("  ✓ composite tenant keys isolate simulation state");

const cleanupRepository = new SimulationSessionRepository();
const cleanupService = new SimulationService(cleanupRepository);
const cleanupDocument = { ...document, flowId: "flow-cleanup", companyId: "company-cleanup" };

cleanupService.toggleBreakpoint(cleanupDocument.companyId, cleanupDocument.flowId, "msg-1");
assert.equal(cleanupRepository.hasScopeData("company-cleanup", "flow-cleanup"), true);

const runningSnapshot = cleanupService.start(cleanupDocument, { autoAdvance: true, breakpoints: ["msg-1"] });
assert.equal(runningSnapshot.status, "paused");
assert.equal(cleanupRepository.getSession("company-cleanup", "flow-cleanup")?.status, "paused");

const stoppedSnapshot = cleanupService.stop("company-cleanup", "flow-cleanup");
assert.equal(stoppedSnapshot.status, "stopped");
assert.equal(cleanupRepository.hasScopeData("company-cleanup", "flow-cleanup"), false);
assert.equal(cleanupService.getSnapshot("company-cleanup", "flow-cleanup").status, "idle");
console.log("  ✓ stop removes sessions, snapshots, and pending breakpoints");

const disposeRepository = new SimulationSessionRepository();
const disposeService = new SimulationService(disposeRepository);
const disposeDocument = { ...document, flowId: "flow-dispose", companyId: "company-dispose" };

disposeService.start(disposeDocument, { autoAdvance: true });
assert.equal(disposeRepository.hasScopeData("company-dispose", "flow-dispose"), true);
disposeService.disposeScope("company-dispose", "flow-dispose");
assert.equal(disposeRepository.hasScopeData("company-dispose", "flow-dispose"), false);
console.log("  ✓ disposeScope clears orphan simulation artifacts on unmount");

const breakpointRepository = new SimulationSessionRepository();
const breakpointService = new SimulationService(breakpointRepository);
const breakpointDocument = { ...document, flowId: "flow-breakpoints", companyId: "company-breakpoints" };

breakpointService.toggleBreakpoint("company-breakpoints", "flow-breakpoints", "msg-1");
assert.deepEqual(breakpointRepository.getPendingBreakpoints("company-breakpoints", "flow-breakpoints"), ["msg-1"]);

const breakpointRun = breakpointService.start(breakpointDocument, { autoAdvance: true });
assert.equal(breakpointRun.status, "paused");
assert.deepEqual(breakpointRun.breakpoints, ["msg-1"]);
console.log("  ✓ pending breakpoints persist until simulation starts");

const graphSnapshot = documentToSnapshot(document);
const runtimeGraph = snapshotToRuntimeGraph(graphSnapshot);
const buttonsNode = runtimeGraph.nodes.find((node) => node.config.__builderType === "buttons") ?? {
  id: "buttons-1",
  type: "action",
  position_x: 0,
  position_y: 0,
  config: {
    __builderType: "buttons",
    action: "send_buttons",
    message: "Choose",
    buttons: [{ id: "yes", label: "Yes" }],
  },
};

const buttonsResult = executeSimulationNode(buttonsNode, {});
assert.equal(buttonsResult.result.outcome, "waiting_input");
assert.equal(buttonsResult.result.variables?.__waitingFor, INTERACTIVE_SELECTION_INPUT_KEY);
assert.ok(buttonsResult.outputs.outbound);
console.log("  ✓ send_buttons mock waits for interactive selection");

const listNode = {
  ...buttonsNode,
  id: "list-1",
  config: {
    __builderType: "list",
    action: "send_list",
    title: "Services",
    body: "Pick one",
    buttonLabel: "Open",
    rows: [{ id: "svc-1", title: "Service 1", description: "" }],
  },
};
const listResult = executeSimulationNode(listNode, {});
assert.equal(listResult.result.outcome, "waiting_input");
assert.equal(listResult.result.variables?.__waitingFor, INTERACTIVE_SELECTION_INPUT_KEY);
console.log("  ✓ send_list mock waits for interactive selection");

const waitNode = {
  ...buttonsNode,
  id: "wait-1",
  config: {
    __builderType: "wait_for_reply",
    action: "wait_for_reply",
    inputKey: "reply",
    prompt: "Tell us more",
  },
};
const waitResult = executeSimulationNode(waitNode, {});
assert.equal(waitResult.result.outcome, "waiting_input");
assert.equal(waitResult.result.variables?.__waitingFor, "reply");
console.log("  ✓ wait_for_reply mock preserves input key waiting state");

const dateNode = {
  ...buttonsNode,
  id: "date-1",
  config: {
    __builderType: "date_picker",
    action: "pick_date",
    inputKey: "appointment_date",
    prompt: "Choose a date",
  },
};
const dateResult = executeSimulationNode(dateNode, {});
assert.equal(dateResult.result.outcome, "waiting_input");
assert.equal(dateResult.result.variables?.__waitingFor, "appointment_date");
assert.equal(dateResult.outputs.datePicker, true);
console.log("  ✓ pick_date mock matches automation engine waiting behavior");

const crmNode = {
  ...buttonsNode,
  id: "crm-1",
  config: {
    __builderType: "find_customer",
    action: "find_customer",
    outputVariable: "customer_lookup",
  },
};
const crmResult = executeSimulationNode(crmNode, {});
assert.equal(crmResult.result.outcome, "continue");
assert.equal((crmResult.result.variables as Record<string, unknown>).customer_lookup?.simulated, true);
assert.equal((crmResult.result.variables as Record<string, unknown>).customer_lookup?.sideEffectsBlocked, true);
console.log("  ✓ CRM nodes mock without production side effects");

const aiNode = {
  ...buttonsNode,
  id: "ai-1",
  config: {
    __builderType: "ai_summarizer",
    action: "ai_summarizer",
    outputVariable: "summary",
  },
};
const aiResult = executeSimulationNode(aiNode, {});
assert.equal(aiResult.result.outcome, "continue");
assert.equal((aiResult.result.variables as Record<string, unknown>).summary?.providerBlocked, true);
console.log("  ✓ AI nodes mock without provider execution");

const waitingVariables = {
  __waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
  __prompt: "Choose",
};
const resumedButtons = executeSimulationNode(buttonsNode, waitingVariables, {
  simulatedInput: { [INTERACTIVE_SELECTION_INPUT_KEY]: "yes" },
});
assert.equal(resumedButtons.result.outcome, "continue");
assert.equal(resumedButtons.result.variables?.__waitingFor, null);
console.log("  ✓ interactive resume applies simulated selection without production execution");

const buttonsBuilderNode = createBuilderNode("buttons", { x: 0, y: 120 }, "buttons-flow-1");
buttonsBuilderNode.config = {
  message: "Continue?",
  buttons: [{ id: "go", label: "Go" }],
};
const buttonsDocument = buildLinearDocument("flow-buttons", "company-buttons", buttonsBuilderNode);
const buttonsService = new SimulationService(new SimulationSessionRepository());
const buttonsSnapshot = buttonsService.start(buttonsDocument, { autoAdvance: true });
assert.equal(buttonsSnapshot.status, "waiting_input");
assert.equal(buttonsSnapshot.variables.__waitingFor, INTERACTIVE_SELECTION_INPUT_KEY);

const resumedWorkflow = buttonsService.resume("company-buttons", "flow-buttons");
assert.equal(resumedWorkflow.status, "completed");
assert.equal(resumedWorkflow.variables.__waitingFor, null);
console.log("  ✓ interactive workflow resume advances past buttons node");

const idleSnapshot = createIdleSimulationSnapshot("company-idle", "flow-idle");
assert.equal(idleSnapshot.companyId, "company-idle");
assert.equal(idleSnapshot.flowId, "flow-idle");
assert.equal(idleSnapshot.status, "idle");
console.log("  ✓ idle snapshots include composite tenant metadata");

const selectorDir = join(dirname(fileURLToPath(import.meta.url)), "../src/workflow-builder/simulation/selectors");
for (const selectorFile of ["simulation-selectors.ts", "simulation-timeline-selectors.ts"]) {
  const source = readFileSync(join(selectorDir, selectorFile), "utf8");
  assert.doesNotMatch(source, /from "\.\.\/services\//);
  assert.doesNotMatch(source, /from "\.\.\/repositories\//);
}
console.log("  ✓ simulation selectors remain pure without service or repository imports");

const fingerprintA = computeWorkflowDocumentFingerprint(document);
const fingerprintB = computeWorkflowDocumentFingerprint({ ...document, name: "Renamed only" });
assert.equal(fingerprintA, fingerprintB);
const mutatedDocument = {
  ...document,
  nodes: document.nodes.map((node) =>
    node.id === "msg-1" ? { ...node, config: { ...node.config, message: "Changed" } } : node,
  ),
};
assert.notEqual(fingerprintA, computeWorkflowDocumentFingerprint(mutatedDocument));
assert.equal(hasWorkflowDocumentDrift(fingerprintA, mutatedDocument), true);
console.log("  ✓ document fingerprints detect structural workflow drift");

const driftRepository = new SimulationSessionRepository();
const driftService = new SimulationService(driftRepository);
const driftDocument = { ...document, flowId: "flow-drift", companyId: "company-drift" };
driftService.start(driftDocument, { autoAdvance: true, breakpoints: ["msg-1"] });
assert.ok(driftService.getSessionDocumentFingerprint("company-drift", "flow-drift"));
const runningSession = driftRepository.getSession("company-drift", "flow-drift");
assert.ok(runningSession);
runningSession.status = "running";
driftRepository.setSession("company-drift", "flow-drift", runningSession);
const driftPaused = driftService.pauseForDocumentDrift("company-drift", "flow-drift");
assert.equal(driftPaused.status, "paused");
assert.ok(driftPaused.timeline.some((entry) => entry.label.includes("Restart simulation")));
console.log("  ✓ document drift pauses active simulation without auto-restart");

const cooperativeService = new SimulationService(new SimulationSessionRepository());
const progressSnapshots: string[] = [];
const cooperativeSnapshot = await cooperativeService.startCooperative(
  { ...document, flowId: "flow-cooperative", companyId: "company-cooperative" },
  {
    autoAdvance: true,
    onProgress: (next) => {
      progressSnapshots.push(next.status);
    },
  },
);
assert.equal(cooperativeSnapshot.status, "completed");
assert.ok(progressSnapshots.includes("running"));
console.log("  ✓ cooperative auto-advance yields progress snapshots without changing final outcome");

const isolatedA = new SimulationService(new SimulationSessionRepository());
const isolatedB = new SimulationService(new SimulationSessionRepository());
isolatedA.start({ ...document, flowId: "flow-a", companyId: "company-isolated" }, { autoAdvance: false });
assert.equal(isolatedB.getSnapshot("company-isolated", "flow-a").status, "idle");
console.log("  ✓ isolated repository instances prevent cross-builder mutable state");

console.log("\nAll workflow builder simulation tests passed.\n");
