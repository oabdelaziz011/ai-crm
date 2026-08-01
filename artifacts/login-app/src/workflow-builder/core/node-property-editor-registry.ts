import type { ComponentType } from "react";
import type { BuilderNodeType } from "./types";
import type { NodePropertyEditorProps } from "./node-registry";

const overrides = new Map<BuilderNodeType, ComponentType<NodePropertyEditorProps>>();

export function registerNodePropertyEditorOverride(
  nodeType: BuilderNodeType,
  editor: ComponentType<NodePropertyEditorProps>,
): void {
  overrides.set(nodeType, editor);
}

export function resolveNodePropertyEditorOverride(
  nodeType: BuilderNodeType,
): ComponentType<NodePropertyEditorProps> | undefined {
  return overrides.get(nodeType);
}

export function resetNodePropertyEditorOverridesForTests(): void {
  overrides.clear();
}
