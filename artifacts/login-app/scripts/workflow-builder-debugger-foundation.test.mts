/**
 * Workflow Builder debugger foundation unit tests.
 * Run: pnpm --dir artifacts/login-app test:workflow-builder-debugger-foundation
 */
import assert from "node:assert/strict";
import { computeBranchDepthFromGraph } from "../src/workflow-builder/core/graph/branch-depth";
import { extractExecutedNodeIdsFromSnapshot } from "../src/workflow-builder/core/graph/execution-path";
import { registerBuiltInWorkflowNodes } from "../src/workflow-builder/core/register-built-in-nodes";
import { createBuilderNode } from "../src/workflow-builder/core/persistence/workflow-mapper";
import { createEdgeFromNodes } from "../src/workflow-builder/core/state/builder-reducer";
import { registerBuiltInVariableProviders } from "../src/workflow-builder/core/variables/built-in-variable-providers";
import { DebuggerKernel } from "../src/workflow-builder/debugger/services/debugger-kernel";
import { InMemoryDebuggerReplayRepository } from "../src/workflow-builder/debugger/repositories/in-memory-debugger-replay-repository";
import {
  buildReplayFrameSummaries,
  buildReplayViewModel,
  resolveDisplayedSnapshot,
} from "../src/workflow-builder/debugger/selectors/replay-selectors";
import {
  mapReplayHistoryToActivityEvents,
  mapSelectedSnapshotToActivityEvents,
} from "../src/workflow-builder/debugger/selectors/debug-timeline-adapter";
import {
  buildCallStackViewModel,
  buildDebuggerPanelViewModel,
  buildExecutionInspectorViewModel,
  buildRuntimeInspectorViewModel,
  buildVariableWatchViewModel,
} from "../src/workflow-builder/debugger/selectors/debugger-ui-selectors";
import {
  findTimelineEventById,
  resolveFrameIndexById,
  resolvePrimaryTimelineEventId,
} from "../src/workflow-builder/debugger/selectors/debugger-sync-selectors";
import { createReplayActions, type ReplayActionDeps } from "../src/workflow-builder/debugger/controllers/replay-actions";
import {
  computeDebuggerListWindow,
  DEBUGGER_LIST_VIRTUAL_THRESHOLD,
} from "../src/workflow-builder/debugger/utilities/debugger-list-window";
import { buildDebugFrame, freezeDebugFrame } from "../src/workflow-builder/debugger/utilities/debug-frame-utils";
import { ImmutableHistoryBuffer } from "../src/workflow-builder/debugger/utilities/immutable-history-buffer";
import { hasWorkflowDebuggerPermission } from "../src/workflow-builder/debugger/permissions/debugger-access";
import { createDefaultDebugSelectionState } from "../src/workflow-builder/debugger/types/debugger-types";
import { SimulationSessionRepository } from "../src/workflow-builder/simulation/repositories/simulation-session-repository";
import { SimulationService } from "../src/workflow-builder/simulation/services/simulation-service";
import {
  createIdleSimulationSnapshot,
  freezeSimulationSnapshot,
} from "../src/workflow-builder/simulation/utilities/simulation-snapshot-utils";

registerBuiltInWorkflowNodes();
registerBuiltInVariableProviders();

console.log("\nWorkflow Builder debugger foundation tests\n");

function buildSnapshot(overrides: Partial<ReturnType<typeof createIdleSimulationSnapshot>> = {}) {
  const base = createIdleSimulationSnapshot("company-1", "flow-1");
  return freezeSimulationSnapshot({
    ...(base as ReturnType<typeof createIdleSimulationSnapshot>),
    sessionId: "session-1",
    status: "running",
    currentNodeId: "node-1",
    timeline: [
      {
        id: "tl-1",
        type: "node_entered",
        nodeId: "node-1",
        label: "Start",
        timestamp: "2026-01-01T00:00:00.000Z",
        metadata: {},
      },
    ],
    pathExplorer: [{ nodeId: "node-1", label: "Start", nodeType: "start", status: "current" }],
    startedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

function buildLinearDocument() {
  const start = createBuilderNode("start", { x: 0, y: 0 }, "start-1");
  const message = createBuilderNode("send_message", { x: 0, y: 120 }, "msg-1");
  const end = createBuilderNode("end", { x: 0, y: 240 }, "end-1");
  return {
    flowId: "flow-debug-1",
    companyId: "company-1",
    name: "Debugger journey",
    description: "",
    triggerType: "inbound_message" as const,
    status: "draft" as const,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [start, message, end],
    edges: [createEdgeFromNodes("start-1", "msg-1"), createEdgeFromNodes("msg-1", "end-1")],
  };
}

function buildBranchingDocument() {
  const start = createBuilderNode("start", { x: 0, y: 0 }, "start-1");
  const branch = createBuilderNode("if_else", { x: 0, y: 120 }, "if-1");
  const yesNode = createBuilderNode("send_message", { x: -120, y: 240 }, "yes-1");
  const end = createBuilderNode("end", { x: 0, y: 360 }, "end-1");
  const nodes = [start, branch, yesNode, end];
  const edges = [
    createEdgeFromNodes("start-1", "if-1", nodes),
    { ...createEdgeFromNodes("if-1", "yes-1", nodes), branchKey: "yes" as const, branchLabel: "YES" },
    { ...createEdgeFromNodes("if-1", "end-1", nodes), branchKey: "no" as const, branchLabel: "NO" },
    createEdgeFromNodes("yes-1", "end-1", nodes),
  ];
  return {
    flowId: "flow-branch-1",
    companyId: "company-1",
    name: "Branching journey",
    description: "",
    triggerType: "inbound_message" as const,
    status: "draft" as const,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges,
  };
}

// Generic immutable history buffer
{
  const buffer = new ImmutableHistoryBuffer<{ id: string }>(3, Object.freeze);
  assert.equal(buffer.append({ id: "1" }), 0);
  assert.equal(buffer.append({ id: "2" }), 1);
  assert.equal(buffer.append({ id: "3" }), 2);
  assert.equal(buffer.getState().count, 3);

  buffer.append({ id: "4" });
  assert.equal(buffer.getState().count, 3);
  assert.equal(buffer.current()?.id, "4");
  assert.equal(buffer.list()[0]?.id, "2");

  assert.equal(buffer.previous(), true);
  assert.equal(buffer.current()?.id, "3");
  assert.equal(buffer.jump(0), true);
  assert.equal(buffer.current()?.id, "2");

  buffer.reset();
  assert.equal(buffer.getState().count, 0);
  assert.equal(buffer.current(), null);
  console.log("  ✓ generic immutable history buffer append, navigate, capacity, reset");
}

// Graph-derived branch depth
{
  const document = buildBranchingDocument();
  assert.equal(computeBranchDepthFromGraph(document, ["start-1"]), 0);
  assert.equal(computeBranchDepthFromGraph(document, ["start-1", "if-1", "yes-1"]), 1);
  assert.equal(computeBranchDepthFromGraph(document, ["start-1", "if-1", "end-1"]), 1);

  const snapshot = buildSnapshot({
    currentNodeId: "yes-1",
    timeline: [
      { id: "t1", type: "node_entered", nodeId: "start-1", label: "Start", timestamp: "2026-01-01T00:00:00.000Z", metadata: {} },
      { id: "t2", type: "node_entered", nodeId: "if-1", label: "If", timestamp: "2026-01-01T00:00:01.000Z", metadata: {} },
      { id: "t3", type: "node_entered", nodeId: "yes-1", label: "Yes", timestamp: "2026-01-01T00:00:02.000Z", metadata: {} },
    ],
  });

  const frame = buildDebugFrame(snapshot, 0, null, document);
  assert.equal(frame.branchDepth, 1);
  assert.deepEqual(extractExecutedNodeIdsFromSnapshot(snapshot), ["start-1", "if-1", "yes-1"]);
  console.log("  ✓ branch depth is graph-derived along the executed path");
}

// Debug frame metadata
{
  const snap1 = buildSnapshot({ currentNodeId: "node-1" });
  const snap2 = buildSnapshot({
    currentNodeId: "node-2",
    stateInspector: {
      currentNode: { id: "node-2", type: "send_message", label: "Message" },
      workflowState: "running",
      executionContext: { executedSteps: 2 },
      outputs: {},
    },
    pathExplorer: [
      { nodeId: "node-1", label: "Start", nodeType: "start", status: "executed" },
      { nodeId: "node-2", label: "Message", nodeType: "send_message", status: "current" },
    ],
    timeline: [
      { id: "t1", type: "node_entered", nodeId: "node-1", label: "Start", timestamp: "2026-01-01T00:00:00.000Z", metadata: {} },
      { id: "t2", type: "node_entered", nodeId: "node-2", label: "Message", timestamp: "2026-01-01T00:00:01.000Z", metadata: {} },
    ],
  });

  const frame1 = buildDebugFrame(snap1, 0, null, buildLinearDocument());
  const frame2 = buildDebugFrame(snap2, 1, frame1.frameId, buildLinearDocument());

  assert.ok(frame1.frameId);
  assert.equal(frame1.timestamp, "2026-01-01T00:00:00.000Z");
  assert.equal(frame1.stepNumber, 1);
  assert.equal(frame1.executionDepth, 1);
  assert.equal(frame1.parentFrameId, null);
  assert.equal(frame2.parentFrameId, frame1.frameId);
  assert.equal(frame2.stepNumber, 2);
  assert.ok(Object.isFrozen(freezeDebugFrame(frame2)));
  console.log("  ✓ debug frames include immutable metadata fields");
}

// Repository abstraction
{
  const repository = new InMemoryDebuggerReplayRepository();
  const scopeA = { companyId: "company-a", flowId: "flow-1" };
  const scopeB = { companyId: "company-b", flowId: "flow-1" };

  const frameA = buildDebugFrame(buildSnapshot({ currentNodeId: "a-node" }), 0, null);
  const frameB = buildDebugFrame(buildSnapshot({ currentNodeId: "b-node" }), 0, null);

  repository.append(scopeA.companyId, scopeA.flowId, frameA);
  repository.append(scopeB.companyId, scopeB.flowId, frameB);

  assert.equal(repository.getState(scopeA.companyId, scopeA.flowId).count, 1);
  assert.equal(repository.current(scopeA.companyId, scopeA.flowId)?.snapshot.currentNodeId, "a-node");
  assert.equal(repository.current(scopeB.companyId, scopeB.flowId)?.snapshot.currentNodeId, "b-node");

  repository.reset(scopeA.companyId, scopeA.flowId);
  assert.equal(repository.getState(scopeA.companyId, scopeA.flowId).count, 0);
  assert.equal(repository.getState(scopeB.companyId, scopeB.flowId).count, 1);
  console.log("  ✓ in-memory debugger replay repository preserves scoped behavior");
}

// Debugger kernel initialization
{
  const kernel = new DebuggerKernel(new InMemoryDebuggerReplayRepository());

  assert.equal(kernel.replay.kind, "replay");
  assert.equal(kernel.inspector.kind, "inspector");
  assert.equal(kernel.watches.kind, "watches");
  assert.equal(kernel.breakpoints.kind, "breakpoints");
  assert.equal(kernel.profiler.kind, "profiler");
  assert.equal(kernel.callStack.kind, "call-stack");
  assert.equal(kernel.reports.kind, "reports");
  console.log("  ✓ debugger kernel initializes all extension slots");
}

// Debug context defaults and selection API
{
  assert.deepEqual(createDefaultDebugSelectionState(), {
    selectedFrame: null,
    selectedNode: null,
    selectedVariable: null,
    selectedTimelineEvent: null,
    selectedExpression: null,
  });

  const kernel = new DebuggerKernel(new InMemoryDebuggerReplayRepository());
  const scope = { companyId: "company-1", flowId: "flow-selection" };
  const document = buildLinearDocument();
  const snapshot = buildSnapshot({ currentNodeId: "node-1" });

  assert.deepEqual(kernel.getSelectionState(scope), createDefaultDebugSelectionState());

  kernel.observeSnapshot(scope, snapshot, document);
  const frame = kernel.listFrames(scope)[0]!;

  kernel.selectFrame(scope, frame.frameId);
  kernel.selectNode(scope, "node-1");
  kernel.selectVariable(scope, "customer.name");
  kernel.selectTimelineEvent(scope, "tl-1");
  kernel.selectExpression(scope, "expr-1");

  const selection = kernel.getSelectionState(scope);
  assert.equal(selection.selectedFrame?.frameId, frame.frameId);
  assert.equal(selection.selectedNode, "node-1");
  assert.equal(selection.selectedVariable, "customer.name");
  assert.equal(selection.selectedTimelineEvent, "tl-1");
  assert.equal(selection.selectedExpression, "expr-1");

  kernel.selectFrame(scope, null);
  kernel.selectVariable(scope, null);
  assert.equal(kernel.getSelectionState(scope).selectedFrame, null);
  assert.equal(kernel.getSelectionState(scope).selectedVariable, null);
  console.log("  ✓ debug selection API exposes stable selectors with null defaults");
}

// Immutability
{
  const repository = new InMemoryDebuggerReplayRepository();
  const snapshot = buildSnapshot({ currentNodeId: "node-immutable" });
  repository.append("company-1", "flow-1", buildDebugFrame(snapshot, 0, null));

  const stored = repository.current("company-1", "flow-1");
  assert.ok(Object.isFrozen(stored));
  assert.throws(() => {
    (stored as { frameId: string }).frameId = "mutated";
  });
  console.log("  ✓ appended debug frames remain deeply frozen");
}

// Debugger kernel replay coordination
{
  const kernel = new DebuggerKernel(new InMemoryDebuggerReplayRepository());
  const scope = { companyId: "company-1", flowId: "flow-coord-1" };
  const document = buildLinearDocument();

  const snap1 = buildSnapshot({
    currentNodeId: "node-1",
    timeline: [{ id: "t1", type: "node_entered", nodeId: "node-1", label: "A", timestamp: "2026-01-01T00:00:00.000Z", metadata: {} }],
  });
  const snap2 = buildSnapshot({
    currentNodeId: "node-2",
    timeline: [
      { id: "t1", type: "node_entered", nodeId: "node-1", label: "A", timestamp: "2026-01-01T00:00:00.000Z", metadata: {} },
      { id: "t2", type: "node_entered", nodeId: "node-2", label: "B", timestamp: "2026-01-01T00:00:01.000Z", metadata: {} },
    ],
  });

  kernel.observeSnapshot(scope, snap1, document);
  kernel.observeSnapshot(scope, snap2, document);
  kernel.observeSnapshot(scope, snap2, document);

  assert.equal(kernel.getReplayState(scope).count, 2);
  assert.equal(kernel.getReplayState(scope).mode, "live");

  assert.equal(kernel.stepBack(scope), true);
  assert.equal(kernel.getReplayState(scope).mode, "replay");
  assert.equal(kernel.getSelectedSnapshot(scope)?.currentNodeId, "node-1");

  assert.equal(kernel.stepForward(scope), true);
  assert.equal(kernel.getReplayState(scope).mode, "live");

  kernel.selectNode(scope, "node-2");
  assert.equal(kernel.getInspectorState(scope, snap2).selectedNodeId, "node-2");
  console.log("  ✓ debugger kernel coordinates replay without executing nodes");
}

// Kernel scope isolation
{
  const kernel = new DebuggerKernel(new InMemoryDebuggerReplayRepository());
  const scopeA = { companyId: "company-a", flowId: "flow-iso" };
  const scopeB = { companyId: "company-b", flowId: "flow-iso" };
  const document = buildLinearDocument();

  kernel.observeSnapshot(
    scopeA,
    buildSnapshot({
      currentNodeId: "a-1",
      timeline: [{ id: "a1", type: "node_entered", nodeId: "a-1", label: "A1", timestamp: "2026-01-01T00:00:00.000Z", metadata: {} }],
    }),
    document,
  );
  kernel.observeSnapshot(
    scopeA,
    buildSnapshot({
      currentNodeId: "a-2",
      timeline: [
        { id: "a1", type: "node_entered", nodeId: "a-1", label: "A1", timestamp: "2026-01-01T00:00:00.000Z", metadata: {} },
        { id: "a2", type: "node_entered", nodeId: "a-2", label: "A2", timestamp: "2026-01-01T00:00:01.000Z", metadata: {} },
      ],
    }),
    document,
  );
  kernel.observeSnapshot(scopeB, buildSnapshot({ currentNodeId: "b-1" }), document);
  kernel.stepBack(scopeA);

  assert.equal(kernel.getReplayState(scopeA).mode, "replay");
  assert.equal(kernel.getReplayState(scopeB).mode, "live");
  console.log("  ✓ debugger kernel isolates replay state per tenant scope");
}

// Replay selectors (pure)
{
  const frames = [
    buildDebugFrame(buildSnapshot({ currentNodeId: "node-1", status: "running" }), 0, null, buildLinearDocument()),
    buildDebugFrame(buildSnapshot({ currentNodeId: "node-2", status: "completed" }), 1, "session-1:0:1", buildLinearDocument()),
  ];
  const summaries = buildReplayFrameSummaries(frames);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[1]?.currentNodeId, "node-2");
  assert.equal(summaries[1]?.stepNumber, summaries[1]?.executionDepth);

  const liveSnapshot = frames[1]!.snapshot;
  const replaySnapshot = frames[0]!.snapshot;
  const viewModel = buildReplayViewModel({
    replay: {
      capacity: 256,
      count: 2,
      index: 0,
      canStepBack: false,
      canStepForward: true,
      mode: "replay",
    },
    inspector: {
      selectedNodeId: "node-1",
      selectedFrameIndex: 0,
      currentNodeId: "node-1",
      previousNodeId: null,
      nextNodeId: "node-2",
      workflowState: "running",
    },
    selection: createDefaultDebugSelectionState(),
    selectedSnapshot: replaySnapshot,
    frames,
  });

  assert.equal(viewModel.frames.length, 2);
  assert.ok(viewModel.frames[0]?.frameId);
  assert.equal(
    resolveDisplayedSnapshot({
      liveSnapshot,
      replaySnapshot,
      mode: "replay",
    }).currentNodeId,
    "node-1",
  );
  console.log("  ✓ replay selectors build pure replay view models with frame metadata");
}

// Debug timeline adapter reuses activity timeline
{
  const snapshots = [buildSnapshot({ currentNodeId: "node-1" })];
  const historyEvents = mapReplayHistoryToActivityEvents({
    snapshots,
    companyId: "company-1",
    flowId: "flow-1",
    selectedFrameIndex: 0,
  });
  assert.ok(historyEvents.length > 0);
  assert.equal(historyEvents[0]?.metadata?.debugger, true);
  assert.equal(historyEvents[0]?.metadata?.replayFrameIndex, 0);
  assert.equal(historyEvents[0]?.metadata?.replaySelected, true);

  const selectedEvents = mapSelectedSnapshotToActivityEvents({
    snapshot: snapshots[0]!,
    companyId: "company-1",
    flowId: "flow-1",
    frameIndex: 0,
  });
  assert.ok(selectedEvents.length > 0);
  assert.equal(selectedEvents[0]?.metadata?.debugger, true);
  console.log("  ✓ debug timeline adapter reuses activity timeline events");
}

// Permissions delegate to simulation
{
  const hasSim = hasWorkflowDebuggerPermission(() => true, false);
  const noSim = hasWorkflowDebuggerPermission(() => false, false);
  const superAdmin = hasWorkflowDebuggerPermission(() => false, true);
  assert.equal(hasSim, true);
  assert.equal(noSim, false);
  assert.equal(superAdmin, true);
  console.log("  ✓ debugger permission delegates to simulation permission");
}

// Simulation integration: kernel observes simulation snapshots
{
  const service = new SimulationService(new SimulationSessionRepository());
  const kernel = new DebuggerKernel(new InMemoryDebuggerReplayRepository());
  const document = buildLinearDocument();
  const scope = { companyId: document.companyId, flowId: document.flowId };

  const completed = service.start(document, { autoAdvance: true });
  kernel.observeSnapshot(scope, completed, document);

  assert.equal(kernel.getReplayState(scope).count, 1);
  assert.equal(kernel.getInspectorState(scope, completed).workflowState, "completed");
  assert.equal(kernel.listFrames(scope).length, 1);
  assert.ok(kernel.listFrames(scope)[0]?.frameId);
  console.log("  ✓ kernel appends immutable simulation snapshots without re-execution");
}

// Debugger UI selectors (presentation only)
{
  const snapshot = buildSnapshot({
    currentNodeId: "node-2",
    variables: { "customer.name": "Ada", count: 2 },
    variableMutations: [
      {
        key: "count",
        scope: "workflow",
        previousValue: 1,
        currentValue: 2,
        nodeId: "node-2",
        timestamp: "2026-01-01T00:00:01.000Z",
      },
    ],
    stateInspector: {
      currentNode: { id: "node-2", type: "send_message", label: "Message" },
      workflowState: "running",
      executionContext: { executedSteps: 2, waitingFor: null },
      outputs: { message: "Hello" },
    },
    pathExplorer: [
      { nodeId: "node-1", label: "Start", nodeType: "start", status: "executed" },
      { nodeId: "node-2", label: "Message", nodeType: "send_message", status: "current" },
    ],
    timeline: [
      { id: "t1", type: "node_entered", nodeId: "node-1", label: "Start", timestamp: "2026-01-01T00:00:00.000Z", metadata: {} },
      { id: "t2", type: "node_entered", nodeId: "node-2", label: "Message", timestamp: "2026-01-01T00:00:01.000Z", metadata: {} },
    ],
  });

  const execution = buildExecutionInspectorViewModel({
    snapshot,
    inspector: {
      selectedNodeId: "node-2",
      selectedFrameIndex: 1,
      currentNodeId: "node-2",
      previousNodeId: "node-1",
      nextNodeId: null,
      workflowState: "running",
    },
  });
  assert.equal(execution.currentNodeLabel, "Message");
  assert.equal(execution.previousNodeLabel, "Start");

  const variables = buildVariableWatchViewModel({ snapshot });
  assert.ok(variables.some((entry) => entry.key === "count" && entry.changed));

  const runtime = buildRuntimeInspectorViewModel({
    snapshot,
    frame: {
      frameId: "session-1:1:2",
      timestamp: "2026-01-01T00:00:01.000Z",
      stepNumber: 2,
      executionDepth: 2,
      branchDepth: 0,
      parentFrameId: "session-1:0:1",
    },
  });
  assert.equal(runtime.frameId, "session-1:1:2");
  assert.equal(runtime.outputs.message, "Hello");

  const callStack = buildCallStackViewModel({
    frames: [
      {
        frameIndex: 0,
        frameId: "f0",
        timestamp: "2026-01-01T00:00:00.000Z",
        stepNumber: 1,
        executionDepth: 1,
        branchDepth: 0,
        parentFrameId: null,
        status: "running",
        currentNodeId: "node-1",
        currentNodeLabel: "Start",
        timelineLength: 1,
        executedStepCount: 1,
        capturedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    replay: { capacity: 256, count: 1, index: 0, canStepBack: false, canStepForward: false, mode: "replay" },
    selectedFrameId: "f0",
  });
  assert.equal(callStack[0]?.isSelected, true);
  console.log("  ✓ debugger UI selectors build read-only presentation models");
}

// Debugger sync selectors (timeline ↔ frame resolution)
{
  const frame0 = buildSnapshot({
    currentNodeId: "node-1",
    timeline: [
      { id: "evt-1", type: "node_entered", nodeId: "node-1", label: "Start", timestamp: "2026-01-01T00:00:00.000Z", metadata: {} },
    ],
  });
  const frame1 = buildSnapshot({
    currentNodeId: "node-2",
    timeline: [
      { id: "evt-1", type: "node_entered", nodeId: "node-1", label: "Start", timestamp: "2026-01-01T00:00:00.000Z", metadata: {} },
      { id: "evt-2", type: "node_entered", nodeId: "node-2", label: "Message", timestamp: "2026-01-01T00:00:01.000Z", metadata: {} },
    ],
  });

  assert.equal(resolvePrimaryTimelineEventId(frame0), "evt-1");
  assert.equal(resolvePrimaryTimelineEventId(frame1), "evt-2");

  const match = findTimelineEventById([frame0, frame1], "evt-2");
  assert.ok(match);
  assert.equal(match.frameIndex, 1);
  assert.equal(match.nodeId, "node-2");

  const frames = [
    { frameId: "f0" },
    { frameId: "f1" },
  ];
  assert.equal(resolveFrameIndexById(frames, "f1"), 1);
  console.log("  ✓ debugger sync selectors resolve timeline events to replay frames");
}

// Replay action layer delegates through controller deps (not kernel)
{
  const calls: string[] = [];
  const frames = [
    {
      frameIndex: 0,
      frameId: "f0",
      timestamp: "2026-01-01T00:00:00.000Z",
      stepNumber: 1,
      executionDepth: 1,
      branchDepth: 0,
      parentFrameId: null,
      status: "running" as const,
      currentNodeId: "node-1",
      currentNodeLabel: "Start",
      timelineLength: 1,
      executedStepCount: 1,
      capturedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      frameIndex: 1,
      frameId: "f1",
      timestamp: "2026-01-01T00:00:01.000Z",
      stepNumber: 2,
      executionDepth: 2,
      branchDepth: 0,
      parentFrameId: "f0",
      status: "running" as const,
      currentNodeId: "node-2",
      currentNodeLabel: "Message",
      timelineLength: 2,
      executedStepCount: 2,
      capturedAt: "2026-01-01T00:00:01.000Z",
    },
  ];
  const snapshots = [
    buildSnapshot({ currentNodeId: "node-1", timeline: [{ id: "evt-1", type: "node_entered", nodeId: "node-1", label: "Start", timestamp: "2026-01-01T00:00:00.000Z", metadata: {} }] }),
    buildSnapshot({
      currentNodeId: "node-2",
      timeline: [
        { id: "evt-1", type: "node_entered", nodeId: "node-1", label: "Start", timestamp: "2026-01-01T00:00:00.000Z", metadata: {} },
        { id: "evt-2", type: "node_entered", nodeId: "node-2", label: "Message", timestamp: "2026-01-01T00:00:01.000Z", metadata: {} },
      ],
    }),
  ];

  const deps: ReplayActionDeps = {
    stepFirst: () => { calls.push("stepFirst"); return true; },
    stepBack: () => { calls.push("stepBack"); return true; },
    stepForward: () => { calls.push("stepForward"); return true; },
    stepLast: () => { calls.push("stepLast"); return true; },
    followLive: () => calls.push("followLive"),
    resetReplay: () => calls.push("resetReplay"),
    jumpTo: (index) => { calls.push(`jumpTo:${index}`); return true; },
    selectFrame: (frameId) => calls.push(`selectFrame:${frameId}`),
    selectTimelineEvent: (eventId) => calls.push(`selectTimelineEvent:${eventId}`),
    selectNode: (nodeId) => calls.push(`selectNode:${nodeId}`),
    selectVariable: (key) => calls.push(`selectVariable:${key}`),
    getFrames: () => frames,
    getFrameSnapshots: () => snapshots,
    getReplayIndex: () => 1,
  };

  const actions = createReplayActions(deps);
  actions.next();
  assert.ok(calls.includes("stepForward"));
  assert.ok(calls.includes("selectFrame:f1"));
  assert.ok(calls.includes("selectTimelineEvent:evt-2"));
  assert.ok(calls.includes("selectNode:node-2"));

  calls.length = 0;
  actions.selectTimelineEvent("evt-2");
  assert.ok(calls.some((entry) => entry.startsWith("jumpTo:1")));
  assert.ok(calls.includes("selectTimelineEvent:evt-2"));
  console.log("  ✓ replay actions delegate through controller deps and synchronize selection");
}

// List window virtualization thresholds
{
  const small = computeDebuggerListWindow({ count: 12, rowHeight: 88 });
  assert.equal(small.shouldVirtualize, false);
  assert.equal(small.endIndex, 12);

  const large = computeDebuggerListWindow({
    count: DEBUGGER_LIST_VIRTUAL_THRESHOLD + 1,
    rowHeight: 88,
    scrollTop: 0,
    viewportHeight: 320,
  });
  assert.equal(large.shouldVirtualize, true);
  assert.ok(large.endIndex < large.startIndex + DEBUGGER_LIST_VIRTUAL_THRESHOLD + 1);
  console.log("  ✓ debugger list window enables virtualization for large datasets");
}

// Panel view model builder (single presentation source)
{
  const snapshot = buildSnapshot({
    currentNodeId: "node-2",
    variables: { count: 2 },
    pathExplorer: [
      { nodeId: "node-1", label: "Start", nodeType: "start", status: "executed" },
      { nodeId: "node-2", label: "Message", nodeType: "send_message", status: "current" },
    ],
    stateInspector: {
      currentNode: { id: "node-2", type: "send_message", label: "Message" },
      workflowState: "running",
      executionContext: { executedSteps: 2 },
      outputs: {},
    },
    timeline: [
      { id: "t1", type: "node_entered", nodeId: "node-1", label: "Start", timestamp: "2026-01-01T00:00:00.000Z", metadata: {} },
      { id: "t2", type: "node_entered", nodeId: "node-2", label: "Message", timestamp: "2026-01-01T00:00:01.000Z", metadata: {} },
    ],
  });
  const panel = buildDebuggerPanelViewModel({
    displayedSnapshot: snapshot,
    inspector: {
      selectedNodeId: "node-2",
      selectedFrameIndex: 1,
      currentNodeId: "node-2",
      previousNodeId: "node-1",
      nextNodeId: null,
      workflowState: "running",
    },
    selection: {
      ...createDefaultDebugSelectionState(),
      selectedTimelineEvent: "t2",
      selectedVariable: "count",
    },
    replay: { capacity: 256, count: 2, index: 1, canStepBack: true, canStepForward: false, mode: "replay" },
    frames: [
      {
        frameIndex: 0,
        frameId: "f0",
        timestamp: "2026-01-01T00:00:00.000Z",
        stepNumber: 1,
        executionDepth: 1,
        branchDepth: 0,
        parentFrameId: null,
        status: "running",
        currentNodeId: "node-1",
        currentNodeLabel: "Start",
        timelineLength: 1,
        executedStepCount: 1,
        capturedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        frameIndex: 1,
        frameId: "f1",
        timestamp: "2026-01-01T00:00:01.000Z",
        stepNumber: 2,
        executionDepth: 2,
        branchDepth: 0,
        parentFrameId: "f0",
        status: "running",
        currentNodeId: "node-2",
        currentNodeLabel: "Message",
        timelineLength: 2,
        executedStepCount: 2,
        capturedAt: "2026-01-01T00:00:01.000Z",
      },
    ],
  });

  assert.equal(panel.execution.currentNodeLabel, "Message");
  assert.equal(panel.selectedVariableKey, "count");
  assert.ok(panel.timeline.cards.some((card) => card.highlight.isSelected));
  assert.equal(panel.variableListWindow.shouldVirtualize, false);

  const panelAgain = buildDebuggerPanelViewModel({
    displayedSnapshot: snapshot,
    inspector: {
      selectedNodeId: "node-2",
      selectedFrameIndex: 1,
      currentNodeId: "node-2",
      previousNodeId: "node-1",
      nextNodeId: null,
      workflowState: "running",
    },
    selection: {
      ...createDefaultDebugSelectionState(),
      selectedTimelineEvent: "t2",
      selectedVariable: "count",
    },
    replay: { capacity: 256, count: 2, index: 1, canStepBack: true, canStepForward: false, mode: "replay" },
    frames: panel.callStack.map((frame) => ({
      frameIndex: frame.frameIndex,
      frameId: frame.frameId,
      timestamp: frame.frameIndex === 0 ? "2026-01-01T00:00:00.000Z" : "2026-01-01T00:00:01.000Z",
      stepNumber: frame.stepNumber,
      executionDepth: frame.executionDepth,
      branchDepth: frame.branchDepth,
      parentFrameId: frame.parentFrameId,
      status: frame.status,
      currentNodeId: frame.currentNodeId,
      currentNodeLabel: frame.currentNodeLabel,
      timelineLength: frame.frameIndex + 1,
      executedStepCount: frame.stepNumber,
      capturedAt: frame.frameIndex === 0 ? "2026-01-01T00:00:00.000Z" : "2026-01-01T00:00:01.000Z",
    })),
  });
  assert.deepEqual(panel.execution, panelAgain.execution);
  assert.deepEqual(panel.timeline.cards.map((card) => card.id), panelAgain.timeline.cards.map((card) => card.id));
  console.log("  ✓ debugger panel view model is pure and aggregates synchronized presentation state");
}

console.log("\nAll debugger foundation tests passed.\n");
