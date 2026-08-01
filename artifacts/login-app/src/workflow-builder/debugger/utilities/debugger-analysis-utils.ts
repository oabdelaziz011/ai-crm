import type { WorkflowDocument } from "../../core/types";
import { extractExecutedNodeIdsFromSnapshot } from "../../core/graph/execution-path";
import type { SimulationSnapshot } from "../../simulation/types/simulation-types";
import type {
  DebugReportViewModel,
  ExecutionMetricsViewModel,
  HotPathSummary,
  NodeProfilerEntry,
  PerformanceTimelineHighlight,
} from "../types/debugger-advanced-types";
import type { DebugFrame } from "../types/debugger-types";

const SLOW_NODE_THRESHOLD_MS = 120;
const MEMORY_BYTES_PER_VARIABLE = 64;
const MEMORY_BYTES_PER_FRAME = 512;

type NodeTimingAccumulator = {
  nodeId: string;
  label: string;
  executionCount: number;
  durations: number[];
};

function readNodeLabel(snapshot: Readonly<SimulationSnapshot>, nodeId: string): string {
  const pathEntry = snapshot.pathExplorer.find((entry) => entry.nodeId === nodeId);
  if (pathEntry) return pathEntry.label;
  if (snapshot.stateInspector.currentNode?.id === nodeId) {
    return snapshot.stateInspector.currentNode.label;
  }
  return nodeId;
}

function readTimestampMs(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : null;
}

export function buildNodeProfilerFromFrames(frames: ReadonlyArray<Readonly<DebugFrame>>): NodeProfilerEntry[] {
  const accumulators = new Map<string, NodeTimingAccumulator>();

  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    const previousFrame = frameIndex > 0 ? frames[frameIndex - 1] : null;
    const frameStartedAt = readTimestampMs(frame.timestamp);
    const previousStartedAt = readTimestampMs(previousFrame?.timestamp ?? null);
    const frameDuration =
      frameStartedAt != null && previousStartedAt != null ? Math.max(frameStartedAt - previousStartedAt, 0) : 0;

    if (frame.snapshot.currentNodeId && frameDuration > 0) {
      registerDuration(accumulators, frame.snapshot, frame.snapshot.currentNodeId, frameDuration);
    }

    for (const entry of frame.snapshot.timeline) {
      if (entry.type !== "node_entered" || !entry.nodeId) continue;
      registerVisit(accumulators, frame.snapshot, entry.nodeId);
    }
  }

  return [...accumulators.values()]
    .map((entry) => {
      const totalDurationMs = entry.durations.reduce((sum, value) => sum + value, 0);
      const averageDurationMs = entry.durations.length > 0 ? totalDurationMs / entry.durations.length : 0;
      return {
        nodeId: entry.nodeId,
        label: entry.label,
        executionCount: entry.executionCount,
        averageDurationMs,
        minDurationMs: entry.durations.length > 0 ? Math.min(...entry.durations) : 0,
        maxDurationMs: entry.durations.length > 0 ? Math.max(...entry.durations) : 0,
        totalDurationMs,
      };
    })
    .sort((left, right) => right.totalDurationMs - left.totalDurationMs);
}

function registerVisit(
  accumulators: Map<string, NodeTimingAccumulator>,
  snapshot: Readonly<SimulationSnapshot>,
  nodeId: string,
) {
  const existing = accumulators.get(nodeId);
  if (existing) {
    existing.executionCount += 1;
    return;
  }
  accumulators.set(nodeId, {
    nodeId,
    label: readNodeLabel(snapshot, nodeId),
    executionCount: 1,
    durations: [],
  });
}

function registerDuration(
  accumulators: Map<string, NodeTimingAccumulator>,
  snapshot: Readonly<SimulationSnapshot>,
  nodeId: string,
  durationMs: number,
) {
  const existing = accumulators.get(nodeId) ?? {
    nodeId,
    label: readNodeLabel(snapshot, nodeId),
    executionCount: 0,
    durations: [],
  };
  existing.durations.push(durationMs);
  accumulators.set(nodeId, existing);
}

export function buildPerformanceTimelineHighlights(input: {
  snapshot: Readonly<SimulationSnapshot>;
  profiler: ReadonlyArray<NodeProfilerEntry>;
}): PerformanceTimelineHighlight[] {
  const slowNodes = new Set(
    input.profiler.filter((entry) => entry.maxDurationMs >= SLOW_NODE_THRESHOLD_MS).map((entry) => entry.nodeId),
  );
  const repeatedNodes = new Set(
    input.profiler.filter((entry) => entry.executionCount > 1).map((entry) => entry.nodeId),
  );
  const waitingNodeId =
    typeof input.snapshot.stateInspector.executionContext.waitingFor === "string"
      ? input.snapshot.currentNodeId
      : input.snapshot.status === "waiting_input"
        ? input.snapshot.currentNodeId
        : null;

  const highlights: PerformanceTimelineHighlight[] = [];

  for (const entry of input.snapshot.timeline) {
    if (!entry.nodeId) continue;
    if (waitingNodeId && entry.nodeId === waitingNodeId) {
      highlights.push({
        eventId: entry.id,
        nodeId: entry.nodeId,
        label: entry.label,
        kind: "waiting",
        durationMs: null,
      });
      continue;
    }
    if (slowNodes.has(entry.nodeId)) {
      const profile = input.profiler.find((item) => item.nodeId === entry.nodeId);
      highlights.push({
        eventId: entry.id,
        nodeId: entry.nodeId,
        label: entry.label,
        kind: "slow",
        durationMs: profile?.maxDurationMs ?? null,
      });
      continue;
    }
    if (repeatedNodes.has(entry.nodeId)) {
      const profile = input.profiler.find((item) => item.nodeId === entry.nodeId);
      highlights.push({
        eventId: entry.id,
        nodeId: entry.nodeId,
        label: entry.label,
        kind: "repeated",
        durationMs: profile?.averageDurationMs ?? null,
      });
    }
  }

  return highlights;
}

export function buildHotPathSummaries(input: {
  document: WorkflowDocument;
  frames: ReadonlyArray<Readonly<DebugFrame>>;
  profiler: ReadonlyArray<NodeProfilerEntry>;
}): HotPathSummary[] {
  const pathVisits = new Map<string, { nodeIds: string[]; labels: string[]; visitCount: number; totalDurationMs: number }>();

  for (const frame of input.frames) {
    const nodeIds = extractExecutedNodeIdsFromSnapshot(frame.snapshot);
    if (nodeIds.length === 0) continue;
    const labels = nodeIds.map((nodeId) => readNodeLabel(frame.snapshot, nodeId));
    const pathId = nodeIds.join("->");
    const durationMs = nodeIds.reduce((sum, nodeId) => {
      const profile = input.profiler.find((entry) => entry.nodeId === nodeId);
      return sum + (profile?.averageDurationMs ?? 0);
    }, 0);
    const existing = pathVisits.get(pathId);
    if (existing) {
      existing.visitCount += 1;
      existing.totalDurationMs += durationMs;
    } else {
      pathVisits.set(pathId, { nodeIds, labels, visitCount: 1, totalDurationMs: durationMs });
    }
  }

  const paths = [...pathVisits.values()];
  if (paths.length === 0) {
    return [];
  }

  const mostExecuted = [...paths].sort((left, right) => right.visitCount - left.visitCount)[0]!;
  const longest = [...paths].sort((left, right) => right.nodeIds.length - left.nodeIds.length)[0]!;
  const slowest = [...paths].sort((left, right) => right.totalDurationMs - left.totalDurationMs)[0]!;

  return [
    {
      pathId: mostExecuted.nodeIds.join("->"),
      nodeIds: mostExecuted.nodeIds,
      labels: mostExecuted.labels,
      visitCount: mostExecuted.visitCount,
      totalDurationMs: mostExecuted.totalDurationMs,
      kind: "most_executed",
    },
    {
      pathId: longest.nodeIds.join("->"),
      nodeIds: longest.nodeIds,
      labels: longest.labels,
      visitCount: longest.visitCount,
      totalDurationMs: longest.totalDurationMs,
      kind: "longest",
    },
    {
      pathId: slowest.nodeIds.join("->"),
      nodeIds: slowest.nodeIds,
      labels: slowest.labels,
      visitCount: slowest.visitCount,
      totalDurationMs: slowest.totalDurationMs,
      kind: "slowest",
    },
  ];
}

export function buildExecutionMetrics(input: {
  document: WorkflowDocument;
  frames: ReadonlyArray<Readonly<DebugFrame>>;
  snapshot: Readonly<SimulationSnapshot>;
}): ExecutionMetricsViewModel {
  const branchCount = input.document.edges.filter((edge) => edge.branchKey).length;
  const firstFrame = input.frames[0];
  const lastFrame = input.frames.at(-1);
  const replayDurationMs = Math.max(
    (readTimestampMs(lastFrame?.timestamp ?? null) ?? 0) - (readTimestampMs(firstFrame?.timestamp ?? null) ?? 0),
    input.snapshot.durationMs ?? 0,
  );
  const variableCount = Object.keys(input.snapshot.variables).filter((key) => !key.startsWith("__")).length;

  return {
    nodeCount: input.document.nodes.length,
    branchCount,
    replayDurationMs,
    memoryEstimateBytes:
      input.frames.length * MEMORY_BYTES_PER_FRAME + variableCount * MEMORY_BYTES_PER_VARIABLE,
    variableCount,
    frameCount: input.frames.length,
  };
}

export function buildDebugReportViewModel(input: {
  document: WorkflowDocument;
  snapshot: Readonly<SimulationSnapshot>;
  frames: ReadonlyArray<Readonly<DebugFrame>>;
  profiler: ReadonlyArray<NodeProfilerEntry>;
  hotPaths: ReadonlyArray<HotPathSummary>;
}): DebugReportViewModel {
  const executedNodeIds = input.frames.flatMap((frame) => extractExecutedNodeIdsFromSnapshot(frame.snapshot));
  const executedSet = new Set(executedNodeIds);
  const simulationReport = input.snapshot.report;

  const bottlenecks = input.profiler
    .filter((entry) => entry.maxDurationMs >= SLOW_NODE_THRESHOLD_MS)
    .slice(0, 5)
    .map((entry) => `${entry.label} (${Math.round(entry.maxDurationMs)}ms max)`);

  const unusedBranches = input.document.edges
    .filter((edge) => edge.branchKey && !executedSet.has(edge.target))
    .map((edge) => {
      const sourceNode = input.document.nodes.find((node) => node.id === edge.source);
      const targetNode = input.document.nodes.find((node) => node.id === edge.target);
      const sourceLabel = sourceNode?.config?.label ?? sourceNode?.type ?? edge.source;
      const targetLabel = targetNode?.config?.label ?? targetNode?.type ?? edge.target;
      return `${String(sourceLabel)} → ${String(targetLabel)} (${edge.branchKey})`;
    });

  const warnings = simulationReport?.warnings ?? input.snapshot.simulationErrors.filter((issue) => issue.severity === "warning").map((issue) => issue.message);
  const errors = simulationReport?.errors ?? input.snapshot.simulationErrors.filter((issue) => issue.severity === "error").map((issue) => issue.message);
  const readinessScore =
    simulationReport?.readinessScore ??
    Math.max(0, Math.min(100, 100 - errors.length * 12 - warnings.length * 4));

  return {
    generatedAt: new Date().toISOString(),
    readinessScore,
    warnings,
    errors,
    bottlenecks,
    hotPaths: [...input.hotPaths],
    unusedBranches,
    exportPayload: {
      ...(simulationReport?.exportPayload ?? {}),
      generatedAt: new Date().toISOString(),
      readinessScore,
      warnings,
      errors,
      debugger: {
        frameCount: input.frames.length,
        profiler: input.profiler,
        hotPaths: input.hotPaths,
        bottlenecks,
        unusedBranches,
      },
    },
  };
}
