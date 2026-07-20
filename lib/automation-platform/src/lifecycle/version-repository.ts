import type {
  AutomationFlowVersionRecord,
  CreateAutomationFlowVersionInput,
  WorkflowGraphSnapshot,
} from "./types.js";

export interface AutomationFlowVersionRepository {
  create(input: CreateAutomationFlowVersionInput): Promise<AutomationFlowVersionRecord>;
  findById(id: string): Promise<AutomationFlowVersionRecord | null>;
  findByFlowAndNumber(flowId: string, versionNumber: number): Promise<AutomationFlowVersionRecord | null>;
  findActiveByFlowId(flowId: string): Promise<AutomationFlowVersionRecord | null>;
  listByFlowId(flowId: string): Promise<AutomationFlowVersionRecord[]>;
  setActiveVersion(flowId: string, versionId: string): Promise<AutomationFlowVersionRecord>;
  getNextVersionNumber(flowId: string): Promise<number>;
}

export function snapshotToExecutionRecords(
  flowId: string,
  snapshot: WorkflowGraphSnapshot,
): {
  nodes: Array<{
    id: string;
    flow_id: string;
    type: WorkflowGraphSnapshot["nodes"][number]["type"];
    config: Record<string, unknown>;
    position_x: number;
    position_y: number;
    created_at: string;
  }>;
  edges: Array<{
    id: string;
    flow_id: string;
    source_node_id: string;
    target_node_id: string;
    condition: Record<string, unknown>;
    created_at: string;
  }>;
} {
  const createdAt = new Date().toISOString();
  return {
    nodes: snapshot.nodes.map((node) => ({
      id: node.id,
      flow_id: flowId,
      type: node.type,
      config: node.config,
      position_x: node.positionX,
      position_y: node.positionY,
      created_at: createdAt,
    })),
    edges: snapshot.edges.map((edge) => ({
      id: edge.id,
      flow_id: flowId,
      source_node_id: edge.sourceNodeId,
      target_node_id: edge.targetNodeId,
      condition: edge.condition,
      created_at: createdAt,
    })),
  };
}
