import type { LucideIcon } from "lucide-react";
import type { WorkflowBuilderController } from "../../hooks/use-workflow-builder";

export type ToolbarActionContext = {
  controller: WorkflowBuilderController;
};

export type ToolbarActionDefinition = {
  id: string;
  label: string;
  icon?: LucideIcon;
  group: "history" | "layout" | "save" | "publish";
  isDisabled?: (ctx: ToolbarActionContext) => boolean;
  run: (ctx: ToolbarActionContext) => void | Promise<void>;
};

const registry: ToolbarActionDefinition[] = [];

export function registerToolbarAction(action: ToolbarActionDefinition): void {
  registry.push(action);
}

export function listToolbarActions(group?: ToolbarActionDefinition["group"]): ToolbarActionDefinition[] {
  return group ? registry.filter((action) => action.group === group) : [...registry];
}

export function clearToolbarActions(): void {
  registry.length = 0;
}
