import type { WorkflowDocument } from "../types";
import type { WorkflowGraphSnapshot } from "@workspace/automation-platform";
import { getWorkflowNodeDefinition } from "../node-registry";
import { mapDocumentToPersistence } from "../persistence/workflow-mapper";

export function documentToSnapshot(document: WorkflowDocument): WorkflowGraphSnapshot {
  const persistence = mapDocumentToPersistence(document);
  return {
    name: document.name,
    description: document.description,
    triggerType: document.triggerType,
    metadata: persistence.metadata,
    nodes: document.nodes.map((node) => {
      const definition = getWorkflowNodeDefinition(node.type);
      return {
        id: node.id,
        type: definition.engineType,
        config: definition.toEngineConfig(node.config),
        positionX: node.position.x,
        positionY: node.position.y,
      };
    }),
    edges: document.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      condition: buildEdgeCondition(edge),
    })),
  };
}

function buildEdgeCondition(edge: WorkflowDocument["edges"][number]): Record<string, unknown> {
  const condition: Record<string, unknown> = {};
  if (edge.branchKey === "yes" || edge.branchKey === "no") {
    condition.branch = edge.branchKey;
  } else if (edge.branchKey) {
    condition.case = edge.branchKey;
  }
  if (edge.branchLabel) condition.label = edge.branchLabel;
  return condition;
}

export function resolveLifecycleLabel(status: WorkflowDocument["status"]): string {
  if (status === "active") return "Published";
  if (status === "archived") return "Archived";
  if (status === "disabled") return "Archived";
  return "Draft";
}
