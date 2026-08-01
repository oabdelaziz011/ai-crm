import type {
  AutomationEdgeRecord,
  AutomationNodeRecord,
  WorkflowGraphSnapshot,
} from "@workspace/automation-platform";

const SIMULATION_FLOW_ID = "simulation-flow";
const SIMULATION_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function snapshotToRuntimeGraph(snapshot: WorkflowGraphSnapshot): {
  nodes: AutomationNodeRecord[];
  edges: AutomationEdgeRecord[];
} {
  const nodes: AutomationNodeRecord[] = snapshot.nodes.map((node) => ({
    id: node.id,
    flow_id: SIMULATION_FLOW_ID,
    type: node.type,
    config: node.config,
    position_x: node.positionX,
    position_y: node.positionY,
    created_at: SIMULATION_TIMESTAMP,
  }));

  const edges: AutomationEdgeRecord[] = snapshot.edges.map((edge) => ({
    id: edge.id,
    flow_id: SIMULATION_FLOW_ID,
    source_node_id: edge.sourceNodeId,
    target_node_id: edge.targetNodeId,
    condition: edge.condition ?? {},
    created_at: SIMULATION_TIMESTAMP,
  }));

  return { nodes, edges };
}

export function readBuilderNodeLabel(node: AutomationNodeRecord): string {
  const builderType = readString(node.config.__builderType);
  if (builderType) return builderType;
  if (node.type === "condition") {
    return node.config.mode === "switch" ? "switch" : "if_else";
  }
  const action = readString(node.config.action);
  if (action) return action;
  return node.type;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
