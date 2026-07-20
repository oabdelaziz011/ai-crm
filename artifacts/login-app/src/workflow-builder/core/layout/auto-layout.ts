import type { BuilderEdge, BuilderNode } from "../types";
import { NODE_HEIGHT, NODE_WIDTH } from "./alignment";

const VERTICAL_GAP = 48;
const HORIZONTAL_GAP = 80;

export function autoLayoutWorkflow(nodes: BuilderNode[], edges: BuilderEdge[]): BuilderNode[] {
  if (nodes.length === 0) return nodes;

  const start =
    nodes.find((node) => node.type === "start") ??
    nodes.find((node) => !edges.some((edge) => edge.target === node.id)) ??
    nodes[0];
  if (!start) return nodes;

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge.target);
    adjacency.set(edge.source, list);
  }

  const levels = new Map<string, number>();
  const queue: string[] = [start.id];
  levels.set(start.id, 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const level = levels.get(current) ?? 0;
    for (const next of adjacency.get(current) ?? []) {
      if (levels.has(next)) continue;
      levels.set(next, level + 1);
      queue.push(next);
    }
  }

  let maxLevel = 0;
  for (const node of nodes) {
    if (!levels.has(node.id)) levels.set(node.id, 0);
    maxLevel = Math.max(maxLevel, levels.get(node.id) ?? 0);
  }

  const columns = Array.from({ length: maxLevel + 1 }, () => [] as BuilderNode[]);
  for (const node of nodes) {
    columns[levels.get(node.id) ?? 0]?.push(node);
  }

  return nodes.map((node) => {
    const level = levels.get(node.id) ?? 0;
    const column = columns[level] ?? [];
    const index = column.findIndex((entry) => entry.id === node.id);
    const columnWidth = column.length;
    const x = level * (NODE_WIDTH + HORIZONTAL_GAP);
    const y = index * (NODE_HEIGHT + VERTICAL_GAP) - ((columnWidth - 1) * (NODE_HEIGHT + VERTICAL_GAP)) / 2 + 120;
    return { ...node, position: { x, y: Math.max(40, y) } };
  });
}
