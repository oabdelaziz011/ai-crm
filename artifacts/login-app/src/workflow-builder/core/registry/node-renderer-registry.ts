import type { ComponentType } from "react";
import type { NodeProps } from "@xyflow/react";
import { WorkflowNodeCard } from "../../components/nodes/workflow-node-card";

export type WorkflowNodeRendererProps = NodeProps;

const renderers = new Map<string, ComponentType<WorkflowNodeRendererProps>>();

export function registerNodeRenderer(type: string, renderer: ComponentType<WorkflowNodeRendererProps>): void {
  renderers.set(type, renderer);
}

export function getNodeRenderer(type: string): ComponentType<WorkflowNodeRendererProps> {
  return renderers.get(type) ?? WorkflowNodeCard;
}

export function listNodeRenderers(): Record<string, ComponentType<WorkflowNodeRendererProps>> {
  return Object.fromEntries(renderers.entries());
}

export function registerDefaultNodeRenderers(): void {
  if (renderers.has("workflowNode")) return;
  registerNodeRenderer("workflowNode", WorkflowNodeCard);
}
