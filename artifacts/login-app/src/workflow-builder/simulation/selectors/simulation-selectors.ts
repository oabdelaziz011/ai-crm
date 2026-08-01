import { findEntryNode, type AutomationEdgeRecord, type AutomationNodeRecord } from "@workspace/automation-platform";
import type { ValidationIssue } from "../../core/types";
import { readBuilderNodeLabel } from "../utilities/simulation-graph";
import type {
  SimulationError,
  SimulationNodePathStatus,
  SimulationReport,
  SimulationTimelineEntry,
} from "../types/simulation-types";

export function buildPathExplorer(input: {
  nodes: AutomationNodeRecord[];
  executedNodeIds: string[];
  skippedNodeIds: string[];
  currentNodeId: string | null;
  breakpoints: string[];
}): Array<{ nodeId: string; nodeType: string; label: string; status: SimulationNodePathStatus }> {
  const breakpointSet = new Set(input.breakpoints);
  const executedSet = new Set(input.executedNodeIds);
  const skippedSet = new Set(input.skippedNodeIds);

  return input.nodes.map((node) => {
    let status: SimulationNodePathStatus = "pending";
    if (input.currentNodeId === node.id) status = "current";
    else if (executedSet.has(node.id)) status = "executed";
    else if (skippedSet.has(node.id)) status = "skipped";
    if (breakpointSet.has(node.id) && status === "pending") status = "breakpoint";
    return {
      nodeId: node.id,
      nodeType: node.type,
      label: readBuilderNodeLabel(node),
      status,
    };
  });
}

export function buildSimulationErrors(input: {
  validationIssues: ValidationIssue[];
  nodes: AutomationNodeRecord[];
  edges: AutomationEdgeRecord[];
  variables: Record<string, unknown>;
  executedNodeIds: string[];
}): SimulationError[] {
  const errors: SimulationError[] = [];

  for (const issue of input.validationIssues) {
    errors.push({
      id: `validation-${issue.id}`,
      severity: issue.severity === "error" ? "error" : "warning",
      category: "validation",
      message: issue.message,
      nodeId: issue.nodeId,
    });
  }

  const reachable = collectReachableNodeIds(input.nodes, input.edges);
  for (const node of input.nodes) {
    if (!reachable.has(node.id)) {
      errors.push({
        id: `dead-${node.id}`,
        severity: "warning",
        category: "dead_node",
        message: `Node "${readBuilderNodeLabel(node)}" is unreachable from the workflow start.`,
        nodeId: node.id,
      });
    }
  }

  if (input.variables.__waitingFor && !input.executedNodeIds.length) {
    errors.push({
      id: "missing-input",
      severity: "warning",
      category: "variable",
      message: `Waiting for input variable "${String(input.variables.__waitingFor)}" before any node executed.`,
    });
  }

  return errors;
}

function collectReachableNodeIds(
  nodes: AutomationNodeRecord[],
  edges: AutomationEdgeRecord[],
): Set<string> {
  const reachable = new Set<string>();
  if (nodes.length === 0) return reachable;

  try {
    const start = findEntryNode(nodes, edges);
    const queue = [start.id];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (reachable.has(nodeId)) continue;
      reachable.add(nodeId);
      for (const edge of edges) {
        if (edge.source_node_id === nodeId && !reachable.has(edge.target_node_id)) {
          queue.push(edge.target_node_id);
        }
      }
    }
  } catch {
    return reachable;
  }

  return reachable;
}

export function buildSimulationReport(input: {
  durationMs: number;
  nodes: AutomationNodeRecord[];
  executedNodeIds: string[];
  skippedNodeIds: string[];
  validationIssues: ValidationIssue[];
  simulationErrors: SimulationError[];
  timeline: SimulationTimelineEntry[];
  variables: Record<string, unknown>;
}): SimulationReport {
  const errorCount =
    input.validationIssues.filter((issue) => issue.severity === "error").length +
    input.simulationErrors.filter((issue) => issue.severity === "error").length;
  const warningCount =
    input.validationIssues.filter((issue) => issue.severity === "warning").length +
    input.simulationErrors.filter((issue) => issue.severity === "warning").length;

  const pendingNodeCount = Math.max(
    input.nodes.length - input.executedNodeIds.length - input.skippedNodeIds.length,
    0,
  );
  const coveragePercent =
    input.nodes.length > 0 ? Math.round((input.executedNodeIds.length / input.nodes.length) * 100) : 0;
  const readinessScore = Math.max(0, Math.min(100, 100 - errorCount * 12 - warningCount * 4));

  const warnings = [
    ...input.validationIssues.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
    ...input.simulationErrors.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
  ];
  const errors = [
    ...input.validationIssues.filter((issue) => issue.severity === "error").map((issue) => issue.message),
    ...input.simulationErrors.filter((issue) => issue.severity === "error").map((issue) => issue.message),
  ];

  return {
    durationMs: input.durationMs,
    executedNodeCount: input.executedNodeIds.length,
    skippedNodeCount: input.skippedNodeIds.length,
    pendingNodeCount,
    warningCount,
    errorCount,
    coveragePercent,
    readinessScore,
    executedNodeIds: [...input.executedNodeIds],
    skippedNodeIds: [...input.skippedNodeIds],
    warnings,
    errors,
    exportPayload: {
      generatedAt: new Date().toISOString(),
      durationMs: input.durationMs,
      coveragePercent,
      readinessScore,
      executedNodeIds: input.executedNodeIds,
      skippedNodeIds: input.skippedNodeIds,
      warnings,
      errors,
      timeline: input.timeline,
      variables: input.variables,
    },
  };
}

export function filterSimulationTimeline(
  timeline: SimulationTimelineEntry[],
  filter: "all" | "nodes" | "variables" | "decisions",
): SimulationTimelineEntry[] {
  if (filter === "all") return timeline;
  if (filter === "nodes") {
    return timeline.filter((entry) => entry.type === "node_entered" || entry.type === "node_exited");
  }
  if (filter === "variables") {
    return timeline.filter((entry) => entry.type === "variable_changed");
  }
  return timeline.filter(
    (entry) => entry.type === "branch_selected" || entry.type === "decision_taken",
  );
}
