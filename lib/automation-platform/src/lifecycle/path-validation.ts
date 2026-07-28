export type ExecutionGraphNode = {
  id: string;
  label: string;
  isTrigger: boolean;
  isTerminal: boolean;
  /** Pause/resume nodes that may complete without an outgoing edge at runtime. */
  isResumableCheckpoint?: boolean;
};

export type ExecutionGraphEdge = {
  id: string;
  source: string;
  target: string;
  branchKey?: string;
  branchLabel?: string;
};

export type ExecutionPathIssueKind =
  | "dead-end"
  | "branch-dead-end"
  | "path-no-terminal"
  | "non-terminating-cycle"
  | "unreachable";

export type ExecutionPathValidationIssue = {
  id: string;
  message: string;
  nodeId?: string;
  severity: "error" | "warning";
  branchLabel?: string;
  kind: ExecutionPathIssueKind;
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  pathNodeIds: string[];
  pathEdgeIds: string[];
  suggestedFixKeys: string[];
  focusNodeId?: string;
};

type PathStatus = "ok" | "bad";

const SUGGESTED_FIX_KEYS: Record<ExecutionPathIssueKind, string[]> = {
  "dead-end": ["connectNextStep", "addEnd", "addReturnToMainMenu"],
  "branch-dead-end": ["addEnd", "addReturnToMainMenu"],
  "path-no-terminal": ["addEnd", "addReturnToMainMenu", "connectNextStep"],
  "non-terminating-cycle": ["addLoopExit", "connectToTerminal"],
  unreachable: ["connectToWorkflow", "removeIfUnused"],
};

function formatBranchLabel(edge: ExecutionGraphEdge): string {
  if (edge.branchLabel?.trim()) return edge.branchLabel.trim();
  if (edge.branchKey === "yes") return "YES";
  if (edge.branchKey === "no") return "NO";
  if (edge.branchKey === "default") return "Default";
  if (edge.branchKey) return edge.branchKey;
  return "Next";
}

function branchIssueKey(edge: ExecutionGraphEdge): string {
  return edge.branchKey?.trim() || edge.id;
}

function isEffectiveTerminal(node: ExecutionGraphNode, outgoingCount: number): boolean {
  return node.isTerminal || (node.isResumableCheckpoint === true && outgoingCount === 0);
}

type ReverseEdge = { source: string; edge: ExecutionGraphEdge };

function buildReverseAdjacency(edges: ExecutionGraphEdge[]): Map<string, ReverseEdge[]> {
  const reverse = new Map<string, ReverseEdge[]>();
  for (const edge of edges) {
    const list = reverse.get(edge.target) ?? [];
    list.push({ source: edge.source, edge });
    reverse.set(edge.target, list);
  }
  return reverse;
}

function tracePathToTrigger(
  endNodeId: string,
  triggerIds: Set<string>,
  reverseAdjacency: Map<string, ReverseEdge[]>,
  entryEdgeId?: string,
): { pathNodeIds: string[]; pathEdgeIds: string[] } {
  const pathNodeIds = [endNodeId];
  const pathEdgeIds: string[] = [];
  let current = endNodeId;
  let viaEdgeId = entryEdgeId;

  while (!triggerIds.has(current)) {
    const incoming = reverseAdjacency.get(current) ?? [];
    if (incoming.length === 0) break;

    const chosen =
      (viaEdgeId ? incoming.find((entry) => entry.edge.id === viaEdgeId) : undefined) ?? incoming[0]!;
    pathEdgeIds.unshift(chosen.edge.id);
    pathNodeIds.unshift(chosen.source);
    current = chosen.source;
    viaEdgeId = undefined;
  }

  return { pathNodeIds, pathEdgeIds };
}

function tracePathToCycleEntry(
  triggerId: string,
  cycleNodeIds: Set<string>,
  adjacency: Map<string, ExecutionGraphEdge[]>,
): { pathNodeIds: string[]; pathEdgeIds: string[] } {
  const queue: Array<{ nodeId: string; pathNodeIds: string[]; pathEdgeIds: string[] }> = [
    { nodeId: triggerId, pathNodeIds: [triggerId], pathEdgeIds: [] },
  ];
  const visited = new Set<string>([triggerId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (cycleNodeIds.has(current.nodeId) && current.pathNodeIds.length > 1) {
      return { pathNodeIds: current.pathNodeIds, pathEdgeIds: current.pathEdgeIds };
    }

    for (const edge of adjacency.get(current.nodeId) ?? []) {
      if (visited.has(edge.target)) continue;
      visited.add(edge.target);
      queue.push({
        nodeId: edge.target,
        pathNodeIds: [...current.pathNodeIds, edge.target],
        pathEdgeIds: [...current.pathEdgeIds, edge.id],
      });
    }
  }

  return { pathNodeIds: [triggerId], pathEdgeIds: [] };
}

function collectCycleEdges(cycleNodeIds: Set<string>, edges: ExecutionGraphEdge[]): string[] {
  return edges
    .filter((edge) => cycleNodeIds.has(edge.source) && cycleNodeIds.has(edge.target))
    .map((edge) => edge.id);
}

function createIssue(
  base: Omit<
    ExecutionPathValidationIssue,
    "affectedNodeIds" | "affectedEdgeIds" | "pathNodeIds" | "pathEdgeIds" | "suggestedFixKeys" | "kind"
  > & {
    kind: ExecutionPathIssueKind;
    pathNodeIds: string[];
    pathEdgeIds: string[];
  },
): ExecutionPathValidationIssue {
  const affectedNodeIds = [...new Set(base.pathNodeIds)];
  const affectedEdgeIds = [...new Set(base.pathEdgeIds)];
  return {
    ...base,
    affectedNodeIds,
    affectedEdgeIds,
    suggestedFixKeys: SUGGESTED_FIX_KEYS[base.kind],
    focusNodeId: base.focusNodeId ?? affectedNodeIds[affectedNodeIds.length - 1],
  };
}

export function validateExecutionPaths(input: {
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
}): ExecutionPathValidationIssue[] {
  const issues: ExecutionPathValidationIssue[] = [];
  const issueIds = new Set<string>();
  const logicalIssueKeys = new Set<string>();

  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, ExecutionGraphEdge[]>();
  const reverseAdjacency = buildReverseAdjacency(input.edges);
  const triggerIds = new Set(input.nodes.filter((node) => node.isTrigger).map((node) => node.id));

  for (const node of input.nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of input.edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    adjacency.get(edge.source)!.push(edge);
  }

  const pushIssue = (issue: ExecutionPathValidationIssue) => {
    const focusNodeId = issue.focusNodeId ?? issue.nodeId;
    const logicalKey = focusNodeId ? `${issue.kind}:${focusNodeId}` : issue.id;
    if (logicalIssueKeys.has(logicalKey)) return;
    if (issueIds.has(issue.id)) return;
    logicalIssueKeys.add(logicalKey);
    issueIds.add(issue.id);
    issues.push(issue);
  };

  const memo = new Map<string, PathStatus>();
  const cycleNodes = new Set<string>();

  const analyze = (nodeId: string, stack: Set<string>): PathStatus => {
    const cached = memo.get(nodeId);
    if (cached) return cached;

    const node = nodeById.get(nodeId);
    if (!node) {
      memo.set(nodeId, "bad");
      return "bad";
    }

    const outgoing = adjacency.get(nodeId) ?? [];
    if (isEffectiveTerminal(node, outgoing.length)) {
      memo.set(nodeId, "ok");
      return "ok";
    }

    if (outgoing.length === 0) {
      memo.set(nodeId, "bad");
      return "bad";
    }

    if (stack.has(nodeId)) {
      cycleNodes.add(nodeId);
      memo.set(nodeId, "bad");
      return "bad";
    }

    stack.add(nodeId);
    let allOk = true;

    for (const edge of outgoing) {
      if (stack.has(edge.target)) {
        cycleNodes.add(edge.target);
        cycleNodes.add(nodeId);
        allOk = false;
        continue;
      }

      const childStatus = analyze(edge.target, stack);
      if (childStatus !== "ok") {
        allOk = false;
        const branchLabel = formatBranchLabel(edge);
        const sourceNode = nodeById.get(edge.source);
        const targetNode = nodeById.get(edge.target);
        const targetOutgoing = adjacency.get(edge.target) ?? [];

        if (outgoing.length > 1) {
          const traced = tracePathToTrigger(edge.target, triggerIds, reverseAdjacency, edge.id);
          pushIssue(
            createIssue({
              id: `branch-dead-end-${edge.source}-${branchIssueKey(edge)}`,
              nodeId: edge.source,
              branchLabel,
              message: `Branch '${branchLabel}' ends without a terminal step.`,
              severity: "error",
              kind: "branch-dead-end",
              pathNodeIds: traced.pathNodeIds,
              pathEdgeIds: traced.pathEdgeIds,
              focusNodeId: edge.source,
            }),
          );
          continue;
        }

        if (
          targetNode &&
          !isEffectiveTerminal(targetNode, targetOutgoing.length) &&
          targetOutgoing.length === 0
        ) {
          const traced = tracePathToTrigger(edge.target, triggerIds, reverseAdjacency, edge.id);
          pushIssue(
            createIssue({
              id: `dead-end-${edge.target}`,
              nodeId: edge.target,
              message: `${targetNode.label} is a dead end.`,
              severity: "error",
              kind: "dead-end",
              pathNodeIds: traced.pathNodeIds,
              pathEdgeIds: traced.pathEdgeIds,
              focusNodeId: edge.target,
            }),
          );
          continue;
        }

        if (targetNode) {
          const traced = tracePathToTrigger(edge.target, triggerIds, reverseAdjacency, edge.id);
          pushIssue(
            createIssue({
              id: `path-no-terminal-${edge.target}`,
              nodeId: edge.target,
              message: `The execution path starting from node '${targetNode.label}' never reaches a terminal node.`,
              severity: "error",
              kind: "path-no-terminal",
              pathNodeIds: traced.pathNodeIds,
              pathEdgeIds: traced.pathEdgeIds,
              focusNodeId: edge.target,
            }),
          );
          continue;
        }

        if (sourceNode) {
          const traced = tracePathToTrigger(edge.source, triggerIds, reverseAdjacency);
          pushIssue(
            createIssue({
              id: `path-no-terminal-${edge.source}`,
              nodeId: edge.source,
              message: `The execution path starting from node '${sourceNode.label}' never reaches a terminal node.`,
              severity: "error",
              kind: "path-no-terminal",
              pathNodeIds: traced.pathNodeIds,
              pathEdgeIds: traced.pathEdgeIds,
              focusNodeId: edge.source,
            }),
          );
        }
      }
    }

    stack.delete(nodeId);
    memo.set(nodeId, allOk ? "ok" : "bad");
    return allOk ? "ok" : "bad";
  };

  const triggerNodes = input.nodes.filter((node) => node.isTrigger);
  for (const trigger of triggerNodes) {
    analyze(trigger.id, new Set());
  }

  if (cycleNodes.size > 0) {
    const sortedCycleIds = [...cycleNodes].sort();
    const cycleNodeSet = new Set(sortedCycleIds);
    const cycleEdgeIds = collectCycleEdges(cycleNodeSet, input.edges);
    const entryTrigger = triggerNodes[0];
    const entryPath = entryTrigger
      ? tracePathToCycleEntry(entryTrigger.id, cycleNodeSet, adjacency)
      : { pathNodeIds: [], pathEdgeIds: [] };
    const pathNodeIds = [...new Set([...entryPath.pathNodeIds, ...sortedCycleIds])];
    const pathEdgeIds = [...new Set([...entryPath.pathEdgeIds, ...cycleEdgeIds])];

    pushIssue(
      createIssue({
        id: `non-terminating-cycle-${sortedCycleIds.join("-")}`,
        nodeId: sortedCycleIds[0],
        message: "This workflow contains an execution cycle that never reaches a terminal node.",
        severity: "error",
        kind: "non-terminating-cycle",
        pathNodeIds,
        pathEdgeIds,
        focusNodeId: sortedCycleIds[0],
      }),
    );
  }

  const reachable = new Set<string>();
  const visitQueue = [...triggerNodes.map((node) => node.id)];
  for (const triggerId of visitQueue) reachable.add(triggerId);

  for (let index = 0; index < visitQueue.length; index += 1) {
    const nodeId = visitQueue[index]!;
    const node = nodeById.get(nodeId);
    const outgoing = adjacency.get(nodeId) ?? [];
    if (node && isEffectiveTerminal(node, outgoing.length)) continue;

    for (const edge of outgoing) {
      if (reachable.has(edge.target)) continue;
      reachable.add(edge.target);
      visitQueue.push(edge.target);
    }
  }

  for (const node of input.nodes) {
    if (node.isTrigger || reachable.has(node.id)) continue;
    pushIssue(
      createIssue({
        id: `unreachable-${node.id}`,
        nodeId: node.id,
        message: `Node '${node.label}' is unreachable.`,
        severity: "warning",
        kind: "unreachable",
        pathNodeIds: [node.id],
        pathEdgeIds: [],
        focusNodeId: node.id,
      }),
    );
  }

  return issues;
}
