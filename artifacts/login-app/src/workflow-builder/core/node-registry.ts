import type { ComponentType } from "react";
import type { AutomationNodeType } from "@workspace/automation-platform";
import type { BuilderNodeCategory, BuilderNodeType, ValidationIssue } from "./types";

export type NodePropertyEditorProps = {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
};

export type WorkflowNodeDefinition = {
  id: BuilderNodeType;
  displayName: string;
  description: string;
  category: BuilderNodeCategory;
  engineType: AutomationNodeType;
  icon: string;
  accentClass: string;
  searchKeywords?: string[];
  defaultConfig: Record<string, unknown>;
  maxOutgoing?: number | null;
  allowIncoming: boolean;
  allowOutgoing: boolean;
  PropertyEditor: ComponentType<NodePropertyEditorProps>;
  validate: (config: Record<string, unknown>, nodeId: string) => ValidationIssue[];
  toEngineConfig: (config: Record<string, unknown>) => Record<string, unknown>;
  fromEngineConfig: (engineType: AutomationNodeType, config: Record<string, unknown>) => Record<string, unknown> | null;
};

const registry = new Map<BuilderNodeType, WorkflowNodeDefinition>();

export function registerWorkflowNode(definition: WorkflowNodeDefinition): void {
  registry.set(definition.id, definition);
}

export function getWorkflowNodeDefinition(type: BuilderNodeType): WorkflowNodeDefinition {
  const definition = registry.get(type);
  if (!definition) throw new Error(`Unknown workflow node type: ${type}`);
  return definition;
}

export function listWorkflowNodeDefinitions(): WorkflowNodeDefinition[] {
  return [...registry.values()];
}

export function listWorkflowNodesByCategory(category: BuilderNodeCategory): WorkflowNodeDefinition[] {
  return listWorkflowNodeDefinitions().filter((node) => node.category === category);
}

export function resolveBuilderNodeType(
  engineType: AutomationNodeType,
  config: Record<string, unknown>,
): BuilderNodeType | null {
  const explicit = typeof config.builderType === "string" ? (config.builderType as BuilderNodeType) : null;
  if (explicit && registry.has(explicit)) return explicit;

  for (const definition of registry.values()) {
    const restored = definition.fromEngineConfig(engineType, config);
    if (restored) return definition.id;
  }
  return null;
}
