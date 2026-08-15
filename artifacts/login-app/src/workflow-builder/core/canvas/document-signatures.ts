import { resolveBranchEdgeStyle } from "../logic/branch-utils";
import { getWorkflowNodeDefinition } from "../node-registry";
import type { BuilderEdge, BuilderNode, BuilderNodeType, ValidationIssue, WorkflowDocument } from "../types";
import type { StructuralCanvasNode } from "./flow-document-bridge";

/** Presentation-only config keys that must not invalidate structural canvas projection. */
const PRESENTATION_CONFIG_KEYS = new Set([
  "message",
  "question",
  "label",
  "title",
  "body",
  "prompt",
  "description",
  "buttonLabel",
  "placeholder",
  "validationMessage",
]);

function nodePresentationConfig(node: Pick<BuilderNode, "config">): Record<string, unknown> {
  return node.config ?? {};
}

function readPresentationString(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Subtitle from config presentation fields — presentation sync only. */
export function resolveNodePresentationSubtitle(node: Pick<BuilderNode, "config">): string {
  const config = nodePresentationConfig(node);
  return (
    readPresentationString(config, "message") ??
    readPresentationString(config, "question") ??
    readPresentationString(config, "label") ??
    readPresentationString(config, "title") ??
    readPresentationString(config, "body") ??
    readPresentationString(config, "prompt") ??
    ""
  );
}

/** Step display name from node type + i18n — presentation sync only. */
export function resolveNodePresentationLabel(
  node: Pick<BuilderNode, "type">,
  nodeText: (nodeId: string, field: "displayName" | "description", fallback: string) => string,
): string {
  const definition = getWorkflowNodeDefinition(node.type);
  return nodeText(definition.id, "displayName", definition.displayName);
}

export function documentTopologySignature(document: Pick<WorkflowDocument, "nodes" | "edges">): string {
  const nodes = document.nodes
    .map((node) => `${node.id}:${node.type}:${node.position.x},${node.position.y}`)
    .join("|");
  const edges = document.edges
    .map((edge) => `${edge.id}:${edge.source}->${edge.target}:${edge.branchKey ?? ""}:${edge.branchLabel ?? ""}`)
    .join("|");
  return `${nodes}::${edges}`;
}

export function documentPresentationSignature(
  nodes: BuilderNode[],
  nodeText?: (nodeId: string, field: "displayName" | "description", fallback: string) => string,
): string {
  return nodes
    .map((node) => {
      const config = nodePresentationConfig(node);
      const parts = [node.id, resolveNodePresentationSubtitle(node)];
      if (nodeText) {
        parts.push(`label=${resolveNodePresentationLabel(node, nodeText)}`);
      }
      for (const key of PRESENTATION_CONFIG_KEYS) {
        const value = config[key];
        if (typeof value === "string" && value.length > 0) {
          parts.push(`${key}=${value}`);
        }
      }
      return parts.join(":");
    })
    .join("|");
}

export function documentEdgePresentationSignature(
  nodes: StructuralCanvasNode[],
  edges: BuilderEdge[],
  localizeBranchLabel: (rawLabel: string) => string,
): string {
  const nodesById = new Map(nodes.map((node) => [node.id, node.type]));
  return edges
    .map((edge) => {
      const sourceType = nodesById.get(edge.source);
      const style = resolveBranchEdgeStyle(sourceType, edge);
      const rawLabel = style.label ?? "";
      return `${edge.id}:${localizeBranchLabel(rawLabel)}`;
    })
    .join("|");
}

export function documentValidationSignature(
  issues: ValidationIssue[],
  activeIssueId: string | null,
): string {
  const issuePart = issues
    .map((issue) => {
      const nodeIds = (issue.affectedNodeIds ?? (issue.nodeId ? [issue.nodeId] : [])).join(",");
      const edgeIds = (issue.affectedEdgeIds ?? []).join(",");
      return `${issue.id}:${issue.severity}:${nodeIds}:${edgeIds}`;
    })
    .join("|");
  return `${issuePart}::${activeIssueId ?? ""}`;
}

export type StructuralProjectionNode = {
  id: string;
  position: { x: number; y: number };
  selected: boolean;
  nodeType: string;
  branchPorts?: string;
};

/** Topology + geometry + selection — drives structural canvas seed only. */
export function documentStructuralProjectionSignature(nodes: StructuralProjectionNode[]): string {
  return nodes
    .map((node) =>
      [
        node.id,
        `${node.position.x},${node.position.y}`,
        node.selected ? "1" : "0",
        node.nodeType,
        node.branchPorts ?? "",
      ].join(":"),
    )
    .join("|");
}

export function canvasStructuralNodeSignature(
  nodes: StructuralCanvasNode[],
  selectedNodeIds: readonly string[],
): string {
  const selected = new Set(selectedNodeIds);
  return documentStructuralProjectionSignature(
    nodes.map((node) => ({
      id: node.id,
      position: node.position,
      selected: selected.has(node.id),
      nodeType: node.type,
      branchPorts: node.branchPorts?.map((port) => `${port.key}=${port.label}`).join(",") ?? "",
    })),
  );
}

export function edgeTopologySignature(edges: BuilderEdge[]): string {
  return edges
    .map((edge) => `${edge.id}:${edge.source}->${edge.target}:${edge.branchKey ?? ""}:${edge.branchLabel ?? ""}`)
    .join("|");
}

export function canvasStructuralEdgeSignature(
  nodes: StructuralCanvasNode[],
  edges: BuilderEdge[],
  selectedEdgeIds: readonly string[] = [],
): string {
  const nodesById = new Map(nodes.map((node) => [node.id, node.type]));
  const topology = edgeTopologySignature(edges);
  const sourceTypes = edges.map((edge) => `${edge.id}:${nodesById.get(edge.source) ?? ""}`).join("|");
  const selection = selectedEdgeIds.join(",");
  return `${topology}::${sourceTypes}::${selection}`;
}
