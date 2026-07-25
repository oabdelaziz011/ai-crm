import { getWorkflowNodeDefinition } from "../node-registry";
import type { BuilderNode, BuilderNodeType } from "../types";

export const TERMINAL_BUILDER_NODE_TYPES = ["end", "return_to_main_menu"] as const satisfies readonly BuilderNodeType[];

export function isTerminalWorkflowNode(node: Pick<BuilderNode, "type">): boolean {
  return !getWorkflowNodeDefinition(node.type).allowOutgoing;
}

export function workflowHasTerminalNode(nodes: Array<Pick<BuilderNode, "type">>): boolean {
  return nodes.some(isTerminalWorkflowNode);
}
