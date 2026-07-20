import { assignBranchForNewEdge } from "./logic/branch-utils";
import { getWorkflowNodeDefinition } from "./node-registry";
import type { BuilderEdge, BuilderNode, ValidationIssue } from "./types";

export type ConnectionAttempt = {
  sourceId: string;
  targetId: string;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
};

export function canConnect({ sourceId, targetId, nodes, edges }: ConnectionAttempt): { allowed: boolean; reason?: string } {
  if (sourceId === targetId) {
    return { allowed: false, reason: "A step cannot connect to itself." };
  }

  const source = nodes.find((node) => node.id === sourceId);
  const target = nodes.find((node) => node.id === targetId);
  if (!source || !target) {
    return { allowed: false, reason: "One of the steps could not be found." };
  }

  const sourceDef = getWorkflowNodeDefinition(source.type);
  const targetDef = getWorkflowNodeDefinition(target.type);

  if (!sourceDef.allowOutgoing) {
    return { allowed: false, reason: `${sourceDef.displayName} cannot send to another step.` };
  }
  if (!targetDef.allowIncoming) {
    return { allowed: false, reason: `Nothing can connect into ${targetDef.displayName}.` };
  }

  if (edges.some((edge) => edge.source === sourceId && edge.target === targetId)) {
    return { allowed: false, reason: "These steps are already connected." };
  }

  if (sourceDef.maxOutgoing != null) {
    const outgoing = edges.filter((edge) => edge.source === sourceId).length;
    if (outgoing >= sourceDef.maxOutgoing) {
      return {
        allowed: false,
        reason:
          source.type === "if_else"
            ? "If / Else can only have YES and NO branches."
            : `${sourceDef.displayName} can only connect to one next step.`,
      };
    }
  }

  const nextBranch = assignBranchForNewEdge(source, edges);
  if (source.type === "switch") {
    if (!nextBranch.branchKey) {
      return { allowed: false, reason: "All Switch branches are already connected." };
    }
    const duplicateBranch = edges.some(
      (edge) => edge.source === sourceId && edge.branchKey === nextBranch.branchKey,
    );
    if (duplicateBranch) {
      return { allowed: false, reason: "Each Switch branch can only connect once." };
    }
  }

  if (source.type === "if_else" && !nextBranch.branchKey) {
    return { allowed: false, reason: "If / Else already has YES and NO branches connected." };
  }

  return { allowed: true };
}

export function detectCycle(nodes: BuilderNode[], edges: BuilderEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge.target);
    adjacency.set(edge.source, list);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  return nodes.some((node) => visit(node.id));
}

export function findIsolatedNodeIds(nodes: BuilderNode[], edges: BuilderEdge[]): string[] {
  if (nodes.length <= 1) return [];
  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }
  return nodes.filter((node) => !connected.has(node.id)).map((node) => node.id);
}

export function connectionIssue(sourceId: string, targetId: string, nodes: BuilderNode[], edges: BuilderEdge[]): ValidationIssue | null {
  const result = canConnect({ sourceId, targetId, nodes, edges });
  if (result.allowed) return null;
  return {
    id: `connection-${sourceId}-${targetId}`,
    message: result.reason ?? "This connection is not allowed.",
    severity: "error",
  };
}
