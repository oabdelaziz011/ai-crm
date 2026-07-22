import type { BuilderNode } from "../types";

export function createBuilderClientKey(): string {
  return crypto.randomUUID();
}

/** Stable React key for property editors — survives save-time node id remaps. */
export function resolveBuilderNodeEditorKey(node: BuilderNode): string {
  return node.clientKey ?? node.id;
}

export function ensureBuilderNodeClientKey(node: BuilderNode): BuilderNode {
  if (node.clientKey) return node;
  return { ...node, clientKey: node.id };
}
