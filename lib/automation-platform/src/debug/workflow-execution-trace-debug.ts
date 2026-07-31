import type { AutomationEdgeRecord, AutomationNodeRecord } from "../types.js";
import type { ExecutionGraphSource } from "../lifecycle/execution-graph.js";
import { isWorkflowExecutionTraceEnabled } from "./runtime-trace-flags.js";

export type WorkflowNodeSummary = {
  id: string;
  type: string;
  action: string | null;
  label: string | null;
  primaryMenu: boolean;
  messagePreview: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function summarizeWorkflowNode(node: AutomationNodeRecord): WorkflowNodeSummary {
  const message =
    readString(node.config.message) ??
    readString(node.config.text) ??
    readString(node.config.body) ??
    readString(node.config.title);

  return {
    id: node.id,
    type: node.type,
    action: readString(node.config.action),
    label:
      readString(node.config.label) ??
      readString(node.config.title) ??
      readString(node.config.name),
    primaryMenu: node.config.primaryMenu === true,
    messagePreview: message ? message.slice(0, 120) : null,
  };
}

export type ExecutedNodeStep = WorkflowNodeSummary & { sequence: number };

function logWorkflowExecutionTrace(payload: Record<string, unknown>): void {
  if (!isWorkflowExecutionTraceEnabled()) return;
  console.info(JSON.stringify({ event: "automation.workflow_execution_trace", ...payload }));
}

const executedNodeTrails = new Map<string, ExecutedNodeStep[]>();

export function recordExecutedNode(runId: string, node: AutomationNodeRecord): ExecutedNodeStep[] {
  const trail = executedNodeTrails.get(runId) ?? [];
  const step: ExecutedNodeStep = {
    sequence: trail.length + 1,
    ...summarizeWorkflowNode(node),
  };
  trail.push(step);
  executedNodeTrails.set(runId, trail);
  if (trail.length === 5) {
    traceWorkflowExecutedNodeTrail({ runId, executedNodes: trail, complete: false });
  }
  return trail;
}

export function flushExecutedNodeTrail(input: {
  runId: string;
  sessionId: string;
  lifecycle: string;
}): void {
  const trail = executedNodeTrails.get(input.runId) ?? [];
  if (trail.length > 0) {
    traceWorkflowExecutedNodeTrail({
      runId: input.runId,
      sessionId: input.sessionId,
      lifecycle: input.lifecycle,
      executedNodes: trail,
      complete: true,
    });
  }
  executedNodeTrails.delete(input.runId);
}

export function traceWorkflowExecutionIdentity(input: {
  runId: string;
  sessionId: string;
  workflowId: string;
  automationFlowId: string;
  publishedVersionId: string;
  publishedVersionNumber: number;
  flowActiveVersionId: string | null;
  executedVersionId: string;
  executedVersionNumber: number;
  hasUnpublishedDraft: boolean;
  versionPinned: boolean;
  versionMatchesPublished: boolean;
  graphSource: ExecutionGraphSource;
  startNodeId: string;
  startNodeType: string;
  startNodeAction: string | null;
  triggerSource: string;
  executionPath: "start" | "resume";
}): void {
  logWorkflowExecutionTrace({
    stage: "execution_identity",
    runId: input.runId,
    sessionId: input.sessionId,
    workflowId: input.workflowId,
    automationFlowId: input.automationFlowId,
    publishedVersionId: input.publishedVersionId,
    publishedVersionNumber: input.publishedVersionNumber,
    flowActiveVersionId: input.flowActiveVersionId,
    executedVersionId: input.executedVersionId,
    executedVersionNumber: input.executedVersionNumber,
    hasUnpublishedDraft: input.hasUnpublishedDraft,
    versionPinned: input.versionPinned,
    versionMatchesPublished: input.versionMatchesPublished,
    editorMayDifferFromRuntime: input.hasUnpublishedDraft,
    graphSource: input.graphSource,
    startNodeId: input.startNodeId,
    startNodeType: input.startNodeType,
    startNodeAction: input.startNodeAction,
    triggerSource: input.triggerSource,
    executionPath: input.executionPath,
    note: input.hasUnpublishedDraft
      ? "Runtime executes the published version graph, not the unpublished editor draft."
      : input.versionPinned && !input.versionMatchesPublished
        ? "Run is pinned to an older version than the current published version."
        : "Runtime graph matches the currently published workflow version.",
  });
}

export function traceWorkflowExecutedNodeTrail(input: {
  runId: string;
  sessionId?: string;
  lifecycle?: string;
  executedNodes: ExecutedNodeStep[];
  complete: boolean;
}): void {
  logWorkflowExecutionTrace({
    stage: "executed_node_trail",
    runId: input.runId,
    sessionId: input.sessionId ?? null,
    lifecycle: input.lifecycle ?? null,
    complete: input.complete,
    executedNodeCount: input.executedNodes.length,
    firstFiveExecutedNodes: input.executedNodes.slice(0, 5),
  });
}

export function traceWorkflowRunStarted(input: {
  runId: string;
  sessionId: string;
  flowId: string;
  flowVersionId: string | null;
  triggerSource: string;
  startNode: AutomationNodeRecord;
  nodeCount: number;
  edgeCount: number;
}): void {
  logWorkflowExecutionTrace({
    stage: "run_started",
    runId: input.runId,
    sessionId: input.sessionId,
    flowId: input.flowId,
    flowVersionId: input.flowVersionId,
    triggerSource: input.triggerSource,
    startNode: summarizeWorkflowNode(input.startNode),
    nodeCount: input.nodeCount,
    edgeCount: input.edgeCount,
  });
}

export function traceWorkflowNodeEntered(input: {
  runId: string;
  sessionId: string;
  node: AutomationNodeRecord;
  executionPath: "start" | "resume" | "executeFromNode";
  hasUserInput: boolean;
}): void {
  logWorkflowExecutionTrace({
    stage: "node_entered",
    executionPath: input.executionPath,
    runId: input.runId,
    sessionId: input.sessionId,
    node: summarizeWorkflowNode(input.node),
    hasUserInput: input.hasUserInput,
  });
}

export function traceWorkflowNodeCompleted(input: {
  runId: string;
  sessionId: string;
  node: AutomationNodeRecord;
  outcome: string;
  output?: Record<string, unknown>;
  outboundQueueLength?: number;
  latestOutboundKind?: string | null;
  waitingFor?: string | null;
}): void {
  logWorkflowExecutionTrace({
    stage: "node_completed",
    runId: input.runId,
    sessionId: input.sessionId,
    node: summarizeWorkflowNode(input.node),
    outcome: input.outcome,
    output: input.output ?? null,
    outboundQueueLength: input.outboundQueueLength ?? null,
    latestOutboundKind: input.latestOutboundKind ?? null,
    waitingFor: input.waitingFor ?? null,
  });
}

export function traceWorkflowEdgeSelected(input: {
  runId: string;
  sessionId: string;
  fromNode: AutomationNodeRecord;
  toNode: AutomationNodeRecord | null;
  nextNodeId: string | null;
  selectionReason: string;
  requestedBranch?: string | null;
  selectedEdge?: {
    edgeId: string;
    targetNodeId: string;
    conditionBranch: string | null;
  } | null;
}): void {
  logWorkflowExecutionTrace({
    stage: "edge_selected",
    runId: input.runId,
    sessionId: input.sessionId,
    fromNode: summarizeWorkflowNode(input.fromNode),
    toNode: input.toNode ? summarizeWorkflowNode(input.toNode) : null,
    nextNodeId: input.nextNodeId,
    selectionReason: input.selectionReason,
    requestedBranch: input.requestedBranch ?? null,
    selectedEdge: input.selectedEdge ?? null,
  });
}

export function traceWorkflowRunFinalized(input: {
  runId: string;
  sessionId: string;
  lifecycle: string;
  currentNodeId: string | null;
  outboundQueueLength: number;
  outboundMessages: Array<{ kind: string; preview: string | null }>;
}): void {
  logWorkflowExecutionTrace({
    stage: "run_finalized",
    runId: input.runId,
    sessionId: input.sessionId,
    lifecycle: input.lifecycle,
    currentNodeId: input.currentNodeId,
    outboundQueueLength: input.outboundQueueLength,
    outboundMessages: input.outboundMessages,
  });
}

export function serializeSelectedEdge(
  edge: AutomationEdgeRecord,
  requestedBranch: string,
): {
  edgeId: string;
  targetNodeId: string;
  conditionBranch: string | null;
} {
  const condition = edge.condition ?? {};
  const branch =
    typeof condition.branch === "string"
      ? condition.branch
      : typeof condition.branchKey === "string"
        ? condition.branchKey
        : null;

  return {
    edgeId: edge.id,
    targetNodeId: edge.target_node_id,
    conditionBranch: branch ?? (Object.keys(condition).length === 0 ? requestedBranch : null),
  };
}
