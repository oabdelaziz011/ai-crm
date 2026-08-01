import type {
  AutomationEdgeRecord,
  AutomationFlowRecord,
  AutomationNodeRecord,
  CreateAutomationEdgeInput,
  CreateAutomationNodeInput,
} from "@workspace/automation-platform";
import { getWorkflowNodeDefinition, resolveBuilderNodeType } from "../node-registry";
import { createBuilderClientKey, ensureBuilderNodeClientKey } from "./builder-node-identity";
import {
  readDocumentExtensions,
  writeDocumentExtensions,
} from "./metadata-extension-registry";
import type { BuilderEdge, BuilderNode, BuilderNodeType, BuilderViewport, WorkflowDocument } from "../types";

const VIEWPORT_METADATA_KEY = "builderViewport";

export function mapFlowToDocument(
  flow: AutomationFlowRecord,
  nodes: AutomationNodeRecord[],
  edges: AutomationEdgeRecord[],
): WorkflowDocument {
  const viewport = readViewport(flow.metadata);
  const extensions = readDocumentExtensions(flow.metadata);
  return {
    flowId: flow.id,
    companyId: flow.company_id,
    name: flow.name,
    description: flow.description,
    triggerType: flow.trigger_type,
    extensions: Object.keys(extensions).length > 0 ? extensions : undefined,
    status: flow.status,
    viewport,
    nodes: nodes.map(mapRecordToBuilderNode).filter(Boolean) as BuilderNode[],
    edges: edges.map(mapRecordToBuilderEdge),
  };
}

export function mapDocumentToPersistence(document: WorkflowDocument): {
  metadata: Record<string, unknown>;
  nodes: CreateAutomationNodeInput[];
  edges: CreateAutomationEdgeInput[];
} {
  const baseMetadata: Record<string, unknown> = {
    builderViewport: document.viewport,
    builderVersion: 2,
  };
  return {
    metadata: writeDocumentExtensions(document, baseMetadata),
    nodes: document.nodes.map((node) => mapBuilderNodeToCreateInput(document.flowId, node)),
    edges: document.edges.map((edge) => mapBuilderEdgeToCreateInput(document.flowId, edge)),
  };
}

function mapRecordToBuilderNode(record: AutomationNodeRecord): BuilderNode | null {
  const builderType = resolveBuilderNodeType(record.type, record.config);
  if (!builderType) return null;

  const definition = getWorkflowNodeDefinition(builderType);
  return ensureBuilderNodeClientKey({
    id: record.id,
    type: builderType,
    position: { x: record.position_x, y: record.position_y },
    config: definition.fromEngineConfig(record.type, record.config) ?? definition.defaultConfig,
  });
}

function mapRecordToBuilderEdge(record: AutomationEdgeRecord): BuilderEdge {
  const condition = record.condition ?? {};
  const branchKey =
    typeof condition.branch === "string"
      ? condition.branch
      : typeof condition.case === "string"
        ? condition.case
        : undefined;
  return {
    id: record.id,
    source: record.source_node_id,
    target: record.target_node_id,
    branchKey,
    branchLabel: typeof condition.label === "string" ? condition.label : undefined,
  };
}

function mapBuilderNodeToCreateInput(flowId: string, node: BuilderNode): CreateAutomationNodeInput {
  const definition = getWorkflowNodeDefinition(node.type);
  const engineConfig = definition.toEngineConfig(node.config);
  return {
    flowId,
    type: definition.engineType,
    config: {
      builderType: node.type,
      ...engineConfig,
    },
    positionX: node.position.x,
    positionY: node.position.y,
  };
}

function mapBuilderEdgeToCreateInput(flowId: string, edge: BuilderEdge): CreateAutomationEdgeInput {
  const condition: Record<string, unknown> = {};
  if (edge.branchKey === "yes" || edge.branchKey === "no") {
    condition.branch = edge.branchKey;
  } else if (edge.branchKey) {
    condition.case = edge.branchKey;
  }
  if (edge.branchLabel) condition.label = edge.branchLabel;
  return {
    flowId,
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    condition,
  };
}

function readViewport(metadata: Record<string, unknown>): BuilderViewport {
  const viewport = metadata[VIEWPORT_METADATA_KEY];
  if (!viewport || typeof viewport !== "object") {
    return { x: 0, y: 0, zoom: 1 };
  }
  const value = viewport as Record<string, unknown>;
  return {
    x: Number(value.x ?? 0),
    y: Number(value.y ?? 0),
    zoom: Number(value.zoom ?? 1),
  };
}

export function createDefaultDocument(input: {
  flowId: string;
  companyId: string;
  name: string;
}): WorkflowDocument {
  return {
    flowId: input.flowId,
    companyId: input.companyId,
    name: input.name,
    description: "",
    triggerType: "inbound_message",
    status: "draft",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
  };
}

export function createBuilderNode(type: BuilderNodeType, position: { x: number; y: number }, id?: string): BuilderNode {
  const definition = getWorkflowNodeDefinition(type);
  return {
    id: id ?? crypto.randomUUID(),
    clientKey: createBuilderClientKey(),
    type,
    position,
    config: structuredClone(definition.defaultConfig),
  };
}
