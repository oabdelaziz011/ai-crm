import type { AgentTaskEdge, AgentTaskGraph, AgentTaskNode } from "../types.js";

export function createTaskNode(
  partial: Omit<AgentTaskNode, "status" | "retryCount" | "maxRetries" | "dependencies"> &
    Partial<Pick<AgentTaskNode, "status" | "retryCount" | "maxRetries" | "dependencies">>,
): AgentTaskNode {
  return {
    dependencies: partial.dependencies ?? [],
    maxRetries: partial.maxRetries ?? 2,
    retryCount: partial.retryCount ?? 0,
    status: partial.status ?? "pending",
    ...partial,
  };
}

export function buildSequentialGraph(workflowId: string, goal: string, nodes: AgentTaskNode[]): AgentTaskGraph {
  const edges: AgentTaskEdge[] = [];
  for (let i = 1; i < nodes.length; i += 1) {
    edges.push({ from: nodes[i - 1].id, to: nodes[i].id, condition: "on_success" });
    nodes[i].dependencies = [...(nodes[i].dependencies ?? []), nodes[i - 1].id];
  }
  return { workflowId, goal, nodes, edges };
}

/** Compute parallel execution batches via topological levels */
export function computeExecutionBatches(graph: AgentTaskGraph): AgentTaskNode[][] {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const completed = new Set<string>();
  const batches: AgentTaskNode[][] = [];
  const pending = new Set(graph.nodes.map((n) => n.id));

  while (pending.size > 0) {
    const ready: AgentTaskNode[] = [];
    for (const id of pending) {
      const node = nodeMap.get(id)!;
      const depsMet = node.dependencies.every((dep) => completed.has(dep));
      if (depsMet) ready.push(node);
    }

    if (ready.length === 0) {
      throw new Error("Task graph contains a cycle or unsatisfiable dependencies.");
    }

    batches.push(ready);
    for (const node of ready) {
      pending.delete(node.id);
      completed.add(node.id);
    }
  }

  return batches;
}

export function getRunnableNodes(graph: AgentTaskGraph): AgentTaskNode[] {
  const completedOrVerified = new Set(
    graph.nodes.filter((n) => n.status === "completed" || n.status === "verified").map((n) => n.id),
  );
  const failed = new Set(graph.nodes.filter((n) => n.status === "failed").map((n) => n.id));

  return graph.nodes.filter((node) => {
    if (node.status !== "pending" && node.status !== "waiting") return false;
    if (node.dependencies.some((dep) => failed.has(dep))) return false;
    return node.dependencies.every((dep) => completedOrVerified.has(dep));
  });
}

export function updateNodeStatus(graph: AgentTaskGraph, taskId: string, status: AgentTaskNode["status"], patch?: Partial<AgentTaskNode>): AgentTaskGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === taskId ? { ...node, ...patch, status } : node,
    ),
  };
}

export function graphProgress(graph: AgentTaskGraph): number {
  if (graph.nodes.length === 0) return 0;
  const done = graph.nodes.filter((n) =>
    ["completed", "verified", "cancelled"].includes(n.status),
  ).length;
  return Math.round((done / graph.nodes.length) * 100);
}

export function isGraphComplete(graph: AgentTaskGraph): boolean {
  return graph.nodes.every((n) => n.status === "verified" || n.status === "cancelled");
}

export function hasGraphFailure(graph: AgentTaskGraph): boolean {
  return graph.nodes.some((n) => n.status === "failed");
}
