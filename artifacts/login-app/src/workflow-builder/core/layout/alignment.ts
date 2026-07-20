import type { BuilderNode } from "../types";

export type AlignmentMode =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "center-horizontal"
  | "center-vertical"
  | "distribute-horizontal"
  | "distribute-vertical";

const NODE_WIDTH = 248;
const NODE_HEIGHT = 120;

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

function nodeBounds(node: BuilderNode) {
  return {
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + NODE_WIDTH,
    bottom: node.position.y + NODE_HEIGHT,
    centerX: node.position.x + NODE_WIDTH / 2,
    centerY: node.position.y + NODE_HEIGHT / 2,
  };
}

function selectionBounds(selected: BuilderNode[]): Bounds {
  return selected.reduce(
    (acc, node) => {
      const bounds = nodeBounds(node);
      return {
        minX: Math.min(acc.minX, bounds.left),
        maxX: Math.max(acc.maxX, bounds.right),
        minY: Math.min(acc.minY, bounds.top),
        maxY: Math.max(acc.maxY, bounds.bottom),
      };
    },
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
}

export function alignNodes(nodes: BuilderNode[], selectedIds: string[], mode: AlignmentMode): BuilderNode[] {
  const selected = nodes.filter((node) => selectedIds.includes(node.id));
  if (selected.length < 2 && !mode.startsWith("distribute")) return nodes;
  if (selected.length < 3 && mode.startsWith("distribute")) return nodes;

  const bounds = selectionBounds(selected);
  const nextPositions = new Map<string, { x: number; y: number }>();

  if (mode === "distribute-horizontal") {
    const sorted = [...selected].sort((a, b) => nodeBounds(a).centerX - nodeBounds(b).centerX);
    const first = nodeBounds(sorted[0]!);
    const last = nodeBounds(sorted[sorted.length - 1]!);
    const span = last.centerX - first.centerX;
    const step = sorted.length > 1 ? span / (sorted.length - 1) : 0;
    sorted.forEach((node, index) => {
      const centerX = first.centerX + step * index;
      nextPositions.set(node.id, {
        x: centerX - NODE_WIDTH / 2,
        y: node.position.y,
      });
    });
  }

  if (mode === "distribute-vertical") {
    const sorted = [...selected].sort((a, b) => nodeBounds(a).centerY - nodeBounds(b).centerY);
    const first = nodeBounds(sorted[0]!);
    const last = nodeBounds(sorted[sorted.length - 1]!);
    const span = last.centerY - first.centerY;
    const step = sorted.length > 1 ? span / (sorted.length - 1) : 0;
    sorted.forEach((node, index) => {
      const centerY = first.centerY + step * index;
      nextPositions.set(node.id, {
        x: node.position.x,
        y: centerY - NODE_HEIGHT / 2,
      });
    });
  }

  const centerX = bounds.minX + (bounds.maxX - bounds.minX) / 2 - NODE_WIDTH / 2;
  const centerY = bounds.minY + (bounds.maxY - bounds.minY) / 2 - NODE_HEIGHT / 2;

  for (const node of selected) {
    if (nextPositions.has(node.id)) continue;
    const position = { ...node.position };
    if (mode === "left") position.x = bounds.minX;
    if (mode === "right") position.x = bounds.maxX - NODE_WIDTH;
    if (mode === "top") position.y = bounds.minY;
    if (mode === "bottom") position.y = bounds.maxY - NODE_HEIGHT;
    if (mode === "center-horizontal") position.x = centerX;
    if (mode === "center-vertical") position.y = centerY;
    nextPositions.set(node.id, position);
  }

  return nodes.map((node) => {
    const next = nextPositions.get(node.id);
    return next ? { ...node, position: next } : node;
  });
}

export function alignmentPositionUpdates(
  nodes: BuilderNode[],
  selectedIds: string[],
  mode: AlignmentMode,
): Array<{ id: string; x: number; y: number }> {
  const before = new Map(nodes.map((node) => [node.id, node.position]));
  const aligned = alignNodes(nodes, selectedIds, mode);
  return selectedIds.flatMap((id) => {
    const next = aligned.find((node) => node.id === id);
    const previous = before.get(id);
    if (!next || !previous) return [];
    if (next.position.x === previous.x && next.position.y === previous.y) return [];
    return [{ id, x: next.position.x, y: next.position.y }];
  });
}

export { NODE_HEIGHT, NODE_WIDTH };
