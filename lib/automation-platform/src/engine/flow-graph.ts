import { AutomationGraphError } from "../errors.js";
import type { AutomationEdgeRecord, AutomationNodeRecord } from "../types.js";

export type AutomationFlowGraph = {
  nodes: AutomationNodeRecord[];
  edges: AutomationEdgeRecord[];
  startNode: AutomationNodeRecord;
};

export function readConditionBranch(condition: Record<string, unknown> | undefined): string | undefined {
  if (!condition) return undefined;
  if (typeof condition.branch === "string") return condition.branch;
  if (typeof condition.branchKey === "string") return condition.branchKey;
  return undefined;
}

export type ConditionOutgoingEdgeDiagnostic = {
  edgeId: string;
  targetNodeId: string;
  condition: Record<string, unknown>;
  conditionBranch: string | null;
  conditionBranchKey: string | null;
  conditionCase: string | null;
  resolvedBranch: string | null;
  matchesRequestedBranch: boolean;
  isUnconditionalFallback: boolean;
};

export type ConditionEdgeResolutionDiagnostic = {
  requestedBranch: string;
  outgoingEdges: ConditionOutgoingEdgeDiagnostic[];
  selectedEdge: ConditionOutgoingEdgeDiagnostic | null;
  nextNodeId: string | null;
  selectionReason: string;
  noEdgeReason: string | null;
};

export function diagnoseConditionEdgeResolution(
  currentNode: AutomationNodeRecord,
  edges: AutomationEdgeRecord[],
  variables: Record<string, unknown>,
): ConditionEdgeResolutionDiagnostic {
  const outgoing = edges.filter((edge) => edge.source_node_id === currentNode.id);

  if (currentNode.type !== "condition" || currentNode.config.mode === "switch") {
    const nextNodeId = resolveNextNodeId(currentNode, { edges }, variables);
    return {
      requestedBranch: typeof variables.__switchCase === "string" ? variables.__switchCase : "default",
      outgoingEdges: outgoing.map((edge) => serializeOutgoingEdge(edge, "")),
      selectedEdge: null,
      nextNodeId,
      selectionReason: "Non if/else condition routing delegated to resolveNextNodeId().",
      noEdgeReason: nextNodeId ? null : "resolveNextNodeId() returned null.",
    };
  }

  const requestedBranch = typeof variables.__branch === "string" ? variables.__branch : "no";
  const outgoingEdges = outgoing.map((edge) => serializeOutgoingEdge(edge, requestedBranch));

  if (outgoing.length === 0) {
    return {
      requestedBranch,
      outgoingEdges,
      selectedEdge: null,
      nextNodeId: null,
      selectionReason: "No outgoing edges available.",
      noEdgeReason: "Condition node has zero outgoing edges in the runtime graph.",
    };
  }

  const branchMatch = outgoing.find((edge) => readConditionBranch(edge.condition) === requestedBranch) ?? null;
  const unconditional = outgoing.find((edge) => !readConditionBranch(edge.condition)) ?? null;
  const fallback = outgoing[0] ?? null;
  const selected = branchMatch ?? unconditional ?? fallback;
  const selectedEdge = selected ? serializeOutgoingEdge(selected, requestedBranch) : null;
  const nextNodeId = selected?.target_node_id ?? null;

  if (branchMatch) {
    return {
      requestedBranch,
      outgoingEdges,
      selectedEdge,
      nextNodeId,
      selectionReason: `Matched outgoing edge ${branchMatch.id} with resolved branch "${readConditionBranch(branchMatch.condition)}" for requested branch "${requestedBranch}".`,
      noEdgeReason: null,
    };
  }

  if (unconditional) {
    return {
      requestedBranch,
      outgoingEdges,
      selectedEdge,
      nextNodeId,
      selectionReason: `No edge matched branch "${requestedBranch}"; fell back to unconditional edge ${unconditional.id}.`,
      noEdgeReason: null,
    };
  }

  if (fallback) {
    return {
      requestedBranch,
      outgoingEdges,
      selectedEdge,
      nextNodeId,
      selectionReason: `No edge matched branch "${requestedBranch}" and no unconditional edge exists; fell back to first outgoing edge ${fallback.id}.`,
      noEdgeReason: null,
    };
  }

  return {
    requestedBranch,
    outgoingEdges,
    selectedEdge: null,
    nextNodeId: null,
    selectionReason: "No edge could be selected.",
    noEdgeReason: "Outgoing edges exist but none could be resolved to a target node.",
  };
}

function serializeOutgoingEdge(
  edge: AutomationEdgeRecord,
  requestedBranch: string,
): ConditionOutgoingEdgeDiagnostic {
  const condition = edge.condition ?? {};
  const resolvedBranch = readConditionBranch(condition);
  return {
    edgeId: edge.id,
    targetNodeId: edge.target_node_id,
    condition,
    conditionBranch: typeof condition.branch === "string" ? condition.branch : null,
    conditionBranchKey: typeof condition.branchKey === "string" ? condition.branchKey : null,
    conditionCase: typeof condition.case === "string" ? condition.case : null,
    resolvedBranch: resolvedBranch ?? null,
    matchesRequestedBranch: resolvedBranch === requestedBranch,
    isUnconditionalFallback: !resolvedBranch,
  };
}

export function findEntryNode(nodes: AutomationNodeRecord[], edges: AutomationEdgeRecord[]): AutomationNodeRecord {
  const trigger = nodes.find((node) => node.type === "trigger");
  if (trigger) return trigger;

  const targets = new Set(edges.map((edge) => edge.target_node_id));
  const root = nodes.find((node) => !targets.has(node.id));
  if (!root) throw new AutomationGraphError("Flow graph has no start node.");
  return root;
}

export function resolveNextNodeId(
  currentNode: AutomationNodeRecord,
  graph: Pick<AutomationFlowGraph, "edges">,
  variables: Record<string, unknown>,
): string | null {
  const outgoing = graph.edges.filter((edge) => edge.source_node_id === currentNode.id);
  if (outgoing.length === 0) return null;

  if (currentNode.type === "condition") {
    if (currentNode.config.mode === "switch") {
      const switchCase = typeof variables.__switchCase === "string" ? variables.__switchCase : "default";
      const cases = Array.isArray(currentNode.config.cases)
        ? (currentNode.config.cases as Array<{ id?: string; value?: unknown }>)
        : [];
      const matched =
        outgoing.find((edge) => edge.condition?.case === switchCase) ??
        // Legacy: edges keyed by case.id while __switchCase is the matched value (or vice versa).
        outgoing.find((edge) => {
          const edgeCase = typeof edge.condition?.case === "string" ? edge.condition.case : "";
          if (!edgeCase || edgeCase === "default") return false;
          const byEdgeId = cases.find((item) => item.id === edgeCase);
          if (byEdgeId != null && String(byEdgeId.value) === switchCase) return true;
          const bySwitchId = cases.find((item) => item.id === switchCase);
          return (
            bySwitchId != null &&
            (edgeCase === bySwitchId.id || edgeCase === String(bySwitchId.value ?? ""))
          );
        }) ??
        outgoing.find((edge) => edge.condition?.case === "default" || edge.condition?.branch === "default") ??
        outgoing.find((edge) => !edge.condition?.case && !edge.condition?.branch) ??
        outgoing[0];
      return matched?.target_node_id ?? null;
    }

    const branch = typeof variables.__branch === "string" ? variables.__branch : "no";
    const matched =
      outgoing.find((edge) => readConditionBranch(edge.condition) === branch) ??
      outgoing.find((edge) => !readConditionBranch(edge.condition)) ??
      outgoing[0];
    return matched?.target_node_id ?? null;
  }

  return outgoing[0]?.target_node_id ?? null;
}

export function findNodeById(nodeId: string, nodes: AutomationNodeRecord[]): AutomationNodeRecord {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) throw new AutomationGraphError(`Node ${nodeId} not found in flow graph.`);
  return node;
}

export function loadFlowGraph(nodes: AutomationNodeRecord[], edges: AutomationEdgeRecord[]): AutomationFlowGraph {
  if (nodes.length === 0) throw new AutomationGraphError("Flow graph has no nodes.");
  return {
    nodes,
    edges,
    startNode: findEntryNode(nodes, edges),
  };
}
