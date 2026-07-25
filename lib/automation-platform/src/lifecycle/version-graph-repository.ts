import type { AutomationEdgeRecord, AutomationNodeRecord } from "../types.js";
import type { WorkflowGraphSnapshot } from "./types.js";

export type MaterializeVersionGraphInput = {
  flowVersionId: string;
  flowId: string;
  snapshot: WorkflowGraphSnapshot;
};

export type VersionGraphNodeRow = {
  flow_version_id: string;
  id: string;
  flow_id: string;
  type: string;
  config: Record<string, unknown>;
  position_x: number;
  position_y: number;
};

export type VersionGraphEdgeRow = {
  flow_version_id: string;
  id: string;
  flow_id: string;
  source_node_id: string;
  target_node_id: string;
  condition: Record<string, unknown>;
};

export type VersionExecutionGraph = {
  nodes: AutomationNodeRecord[];
  edges: AutomationEdgeRecord[];
};

export function buildVersionGraphRows(input: MaterializeVersionGraphInput): {
  nodes: VersionGraphNodeRow[];
  edges: VersionGraphEdgeRow[];
} {
  const nodeIds = new Set(input.snapshot.nodes.map((node) => node.id));

  const nodes: VersionGraphNodeRow[] = input.snapshot.nodes.map((node) => ({
    flow_version_id: input.flowVersionId,
    id: node.id,
    flow_id: input.flowId,
    type: node.type,
    config: node.config,
    position_x: node.positionX,
    position_y: node.positionY,
  }));

  const edges: VersionGraphEdgeRow[] = input.snapshot.edges
    .filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId))
    .map((edge) => ({
      flow_version_id: input.flowVersionId,
      id: edge.id,
      flow_id: input.flowId,
      source_node_id: edge.sourceNodeId,
      target_node_id: edge.targetNodeId,
      condition: edge.condition,
    }));

  return { nodes, edges };
}

export function versionGraphRowsToExecutionRecords(
  flowId: string,
  nodes: VersionGraphNodeRow[],
  edges: VersionGraphEdgeRow[],
): VersionExecutionGraph {
  const createdAt = new Date().toISOString();
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      flow_id: flowId,
      type: node.type as AutomationNodeRecord["type"],
      config: node.config,
      position_x: node.position_x,
      position_y: node.position_y,
      created_at: createdAt,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      flow_id: flowId,
      source_node_id: edge.source_node_id,
      target_node_id: edge.target_node_id,
      condition: edge.condition,
      created_at: createdAt,
    })),
  };
}

export interface AutomationFlowVersionGraphRepository {
  materialize(input: MaterializeVersionGraphInput): Promise<void>;
  hasNode(flowVersionId: string, nodeId: string): Promise<boolean>;
  listExecutionGraph(flowVersionId: string, flowId: string): Promise<VersionExecutionGraph>;
}
