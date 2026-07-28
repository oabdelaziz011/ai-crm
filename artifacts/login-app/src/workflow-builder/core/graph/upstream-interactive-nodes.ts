import {
  SUPPORTED_INTERACTION_TYPES,
  type SupportedInteractionType,
} from "../variables/interaction-variables";
import type { BuilderNode, BuilderNodeType, WorkflowDocument } from "../types";
import { readListDataSourceMode } from "../conversation/list-node-config";

const INTERACTIVE_NODE_TYPES = new Set<BuilderNodeType>(["buttons", "list"]);

export type InteractiveOption = {
  id: string;
  label: string;
  sourceNodeId: string;
  sourceType: "buttons" | "list";
};

function buildIncomingAdjacency(document: WorkflowDocument): Map<string, string[]> {
  const incoming = new Map<string, string[]>();
  for (const edge of document.edges) {
    const parents = incoming.get(edge.target) ?? [];
    parents.push(edge.source);
    incoming.set(edge.target, parents);
  }
  return incoming;
}

/** Upstream node ids in breadth-first order (nearest first). */
export function findUpstreamNodeIds(document: WorkflowDocument, nodeId: string): string[] {
  const incoming = buildIncomingAdjacency(document);
  const visited = new Set<string>();
  const queue = [...(incoming.get(nodeId) ?? [])];
  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    order.push(current);
    for (const parent of incoming.get(current) ?? []) {
      if (!visited.has(parent)) queue.push(parent);
    }
  }

  return order;
}

export function findNearestInteractiveNode(document: WorkflowDocument, nodeId: string): BuilderNode | null {
  for (const upstreamId of findUpstreamNodeIds(document, nodeId)) {
    const node = document.nodes.find((entry) => entry.id === upstreamId);
    if (node && INTERACTIVE_NODE_TYPES.has(node.type)) return node;
  }
  return null;
}

export function findImmediateUpstreamInteractiveNode(
  document: WorkflowDocument,
  nodeId: string,
): BuilderNode | null {
  const incoming = buildIncomingAdjacency(document);
  for (const parentId of incoming.get(nodeId) ?? []) {
    const node = document.nodes.find((entry) => entry.id === parentId);
    if (node && INTERACTIVE_NODE_TYPES.has(node.type)) return node;
  }
  return null;
}

function readInteractiveOptionsFromNode(node: BuilderNode): InteractiveOption[] {
  if (node.type === "buttons") {
    const buttons = Array.isArray(node.config.buttons) ? node.config.buttons : [];
    return buttons.flatMap((entry, index) => {
      if (!entry || typeof entry !== "object") return [];
      const id = typeof (entry as { id?: unknown }).id === "string" ? (entry as { id: string }).id.trim() : "";
      const label =
        typeof (entry as { label?: unknown }).label === "string"
          ? (entry as { label: string }).label.trim()
          : "";
      if (!id) return [];
      return [{ id, label: label || id, sourceNodeId: node.id, sourceType: "buttons" as const }];
    });
  }

  if (node.type === "list") {
    const rows =
      readListDataSourceMode(node.config) === "lookup" && Array.isArray(node.config._lookupPreviewRows)
        ? node.config._lookupPreviewRows
        : Array.isArray(node.config.rows)
          ? node.config.rows
          : [];
    return rows.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const id = typeof (entry as { id?: unknown }).id === "string" ? (entry as { id: string }).id.trim() : "";
      const label =
        typeof (entry as { title?: unknown }).title === "string"
          ? (entry as { title: string }).title.trim()
          : "";
      if (!id) return [];
      return [{ id, label: label || id, sourceNodeId: node.id, sourceType: "list" as const }];
    });
  }

  return [];
}

/** Options from the nearest upstream interactive node (buttons or list). */
export function collectNearestInteractiveOptions(
  document: WorkflowDocument,
  nodeId: string,
): InteractiveOption[] {
  const nearest = findNearestInteractiveNode(document, nodeId);
  return nearest ? readInteractiveOptionsFromNode(nearest) : [];
}

/** Options from the direct parent when it is interactive; otherwise nearest upstream. */
export function collectContextInteractiveOptions(
  document: WorkflowDocument,
  nodeId: string,
): InteractiveOption[] {
  const immediate = findImmediateUpstreamInteractiveNode(document, nodeId);
  if (immediate) return readInteractiveOptionsFromNode(immediate);
  return collectNearestInteractiveOptions(document, nodeId);
}

export function collectKnownInteractiveOptionIds(document: WorkflowDocument): Set<string> {
  const ids = new Set<string>();
  for (const node of document.nodes) {
    if (!INTERACTIVE_NODE_TYPES.has(node.type)) continue;
    for (const option of readInteractiveOptionsFromNode(node)) {
      ids.add(option.id);
    }
  }
  return ids;
}

export function builderNodeTypeToInteractionType(nodeType: BuilderNodeType): SupportedInteractionType | null {
  switch (nodeType) {
    case "buttons":
      return "button";
    case "list":
      return "list";
    default:
      return null;
  }
}

/**
 * Interaction types available for condition values: the upstream interactive step when
 * present, otherwise the full supported catalog for manual authoring.
 */
export function collectContextInteractionTypes(
  document: WorkflowDocument,
  nodeId: string,
): SupportedInteractionType[] {
  const immediate = findImmediateUpstreamInteractiveNode(document, nodeId);
  const contextNode = immediate ?? findNearestInteractiveNode(document, nodeId);
  if (contextNode) {
    const mapped = builderNodeTypeToInteractionType(contextNode.type);
    return mapped ? [mapped] : [];
  }
  return [...SUPPORTED_INTERACTION_TYPES];
}
