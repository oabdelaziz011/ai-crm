import { AutomationGraphError } from "../errors.js";
import type { AutomationEdgeRecord, AutomationNodeRecord } from "../types.js";

export type AutomationFlowGraph = {
  nodes: AutomationNodeRecord[];
  edges: AutomationEdgeRecord[];
  startNode: AutomationNodeRecord;
};

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
      const matched =
        outgoing.find((edge) => edge.condition?.case === switchCase) ??
        outgoing.find((edge) => edge.condition?.case === "default" || edge.condition?.branch === "default") ??
        outgoing.find((edge) => !edge.condition?.case && !edge.condition?.branch) ??
        outgoing[0];
      return matched?.target_node_id ?? null;
    }

    const branch = typeof variables.__branch === "string" ? variables.__branch : "no";
    const matched =
      outgoing.find((edge) => edge.condition?.branch === branch) ??
      outgoing.find((edge) => !edge.condition?.branch) ??
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
