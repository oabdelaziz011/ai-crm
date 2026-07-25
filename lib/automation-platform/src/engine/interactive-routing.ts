import { AutomationGraphError } from "../errors.js";
import { readConversationVariables } from "../runtime/conversation-variables.js";
import type { AutomationEdgeRecord, AutomationNodeRecord } from "../types.js";
import { readConditionBranch, type AutomationFlowGraph } from "./flow-graph.js";

export type InteractiveNextNodeResolution = {
  nextNodeId: string | null;
  selectionReason: string;
};

export function isInteractiveActionNode(node: AutomationNodeRecord): boolean {
  if (node.type !== "action") return false;
  const action = node.config.action;
  return action === "send_buttons" || action === "send_list";
}

export function readEdgeSelectionId(condition: Record<string, unknown> | undefined): string | undefined {
  if (!condition) return undefined;
  if (typeof condition.selectionId === "string" && condition.selectionId.trim()) {
    return condition.selectionId.trim();
  }
  if (typeof condition.case === "string" && condition.case.trim() && condition.case !== "default") {
    return condition.case.trim();
  }
  return undefined;
}

export function isDefaultInteractiveEdge(condition: Record<string, unknown> | undefined): boolean {
  if (!condition) return false;
  return condition.case === "default" || condition.branch === "default";
}

export function isUnconditionalInteractiveEdge(condition: Record<string, unknown> | undefined): boolean {
  if (!condition) return true;
  if (readConditionBranch(condition)) return false;
  if (typeof condition.case === "string" && condition.case.length > 0) return false;
  if (typeof condition.selectionId === "string" && condition.selectionId.length > 0) return false;
  return true;
}

export function isSwitchConditionNode(node: AutomationNodeRecord | undefined): boolean {
  return node?.type === "condition" && node.config.mode === "switch";
}

function readSelectionId(variables: Record<string, unknown>): string | null {
  const conversation = readConversationVariables(variables);
  if (conversation.last_button_id) return conversation.last_button_id;
  const interactiveSelection = variables.interactive_selection;
  if (typeof interactiveSelection === "string" && interactiveSelection.trim()) {
    return interactiveSelection.trim();
  }
  return null;
}

function findNode(nodes: AutomationNodeRecord[], nodeId: string): AutomationNodeRecord | undefined {
  return nodes.find((node) => node.id === nodeId);
}

/**
 * Resolves the next node after an interactive Buttons/List step receives a selection.
 * Never silently picks outgoing[0] when multiple interactive branches exist.
 */
export function resolveInteractiveNextNode(
  currentNode: AutomationNodeRecord,
  graph: Pick<AutomationFlowGraph, "edges"> & { nodes: AutomationNodeRecord[] },
  variables: Record<string, unknown>,
): InteractiveNextNodeResolution {
  if (!isInteractiveActionNode(currentNode)) {
    throw new AutomationGraphError(
      `resolveInteractiveNextNode() called on non-interactive node ${currentNode.id} (${currentNode.type}).`,
    );
  }

  const outgoing = graph.edges.filter((edge) => edge.source_node_id === currentNode.id);
  if (outgoing.length === 0) {
    return { nextNodeId: null, selectionReason: "Interactive node has no outgoing edges." };
  }

  // Priority 1: single outgoing edge — backwards compatible linear routing.
  if (outgoing.length === 1) {
    return {
      nextNodeId: outgoing[0]!.target_node_id,
      selectionReason: "Single outgoing edge (backwards compatible).",
    };
  }

  const { nodes } = graph;

  // Priority 2: route through an immediate Switch node when present.
  const switchEdges = outgoing.filter((edge) => isSwitchConditionNode(findNode(nodes, edge.target_node_id)));
  if (switchEdges.length === 1) {
    return {
      nextNodeId: switchEdges[0]!.target_node_id,
      selectionReason: "Routed to Switch node for selection-based branching.",
    };
  }
  if (switchEdges.length > 1) {
    throw new AutomationGraphError(
      `Interactive node ${currentNode.id} has ${switchEdges.length} Switch outgoing edges. Connect exactly one Switch router.`,
    );
  }

  // Priority 3: selection-tagged edges (selectionId / case).
  const taggedEdges = outgoing.filter((edge) => readEdgeSelectionId(edge.condition));
  if (taggedEdges.length > 0) {
    const selectionId = readSelectionId(variables);
    if (!selectionId) {
      throw new AutomationGraphError(
        `Interactive node ${currentNode.id} has selection-tagged edges but conversation.last_button_id is missing.`,
      );
    }

    const matched =
      taggedEdges.find((edge) => readEdgeSelectionId(edge.condition) === selectionId) ?? null;
    if (matched) {
      return {
        nextNodeId: matched.target_node_id,
        selectionReason: `Matched selection-tagged edge for "${selectionId}".`,
      };
    }
  }

  // Priority 4: explicit default edge.
  const defaultEdge = outgoing.find((edge) => isDefaultInteractiveEdge(edge.condition)) ?? null;
  if (defaultEdge) {
    return {
      nextNodeId: defaultEdge.target_node_id,
      selectionReason: "Fell back to default interactive branch.",
    };
  }

  // Priority 5: fail closed — never silently choose outgoing[0].
  const unconditionalEdges = outgoing.filter((edge) => isUnconditionalInteractiveEdge(edge.condition));
  const firstTarget = outgoing[0]?.target_node_id ?? "unknown";
  throw new AutomationGraphError(
    `Interactive node ${currentNode.id} has ${outgoing.length} outgoing branches (${unconditionalEdges.length} unconditional) ` +
      `without a Switch router or selection-tagged edges. ` +
      `Route through Switch(conversation.last_button_id) or tag edges with selectionId. ` +
      `Refusing to silently execute outgoing[0] → ${firstTarget}.`,
  );
}
