import { computeBranchDepthForSnapshot } from "../../core/graph/branch-depth";
import type { WorkflowDocument } from "../../core/types";
import type { SimulationSnapshot } from "../../simulation/types/simulation-types";
import { freezeSimulationSnapshot } from "../../simulation/utilities/simulation-snapshot-utils";
import type { DebugFrame } from "../types/debugger-types";

function deepFreeze<T>(value: T): Readonly<T> {
  if (value === null || typeof value !== "object") {
    return value as Readonly<T>;
  }

  const target = value as Record<string, unknown> | unknown[];
  Object.freeze(target);

  if (Array.isArray(target)) {
    for (const item of target) {
      deepFreeze(item);
    }
    return target as unknown as Readonly<T>;
  }

  for (const key of Object.keys(target)) {
    deepFreeze(target[key]);
  }

  return target as Readonly<T>;
}

export function resolveStepNumber(snapshot: Readonly<SimulationSnapshot>): number {
  const executedSteps = snapshot.stateInspector.executionContext.executedSteps;
  if (typeof executedSteps === "number") {
    return executedSteps;
  }

  return snapshot.pathExplorer.filter((entry) => entry.status === "executed" || entry.status === "current").length;
}

export function resolveExecutionDepth(snapshot: Readonly<SimulationSnapshot>): number {
  return resolveStepNumber(snapshot);
}

export function resolveBranchDepth(
  snapshot: Readonly<SimulationSnapshot>,
  graph: WorkflowDocument | null | undefined,
): number {
  if (!graph) return 0;
  return computeBranchDepthForSnapshot(graph, snapshot);
}

export function buildDebugFrame(
  snapshot: Readonly<SimulationSnapshot>,
  frameIndex: number,
  parentFrameId: string | null,
  graph?: WorkflowDocument | null,
): DebugFrame {
  const frozenSnapshot = freezeSimulationSnapshot(structuredClone(snapshot) as SimulationSnapshot);
  const stepNumber = resolveStepNumber(frozenSnapshot);
  const timestamp = frozenSnapshot.finishedAt ?? frozenSnapshot.startedAt ?? new Date(0).toISOString();

  return freezeDebugFrame({
    frameId: `${frozenSnapshot.sessionId ?? "idle"}:${frameIndex}:${stepNumber}`,
    timestamp,
    stepNumber,
    executionDepth: resolveExecutionDepth(frozenSnapshot),
    branchDepth: resolveBranchDepth(frozenSnapshot, graph),
    parentFrameId,
    snapshot: frozenSnapshot,
  });
}

export function freezeDebugFrame(frame: DebugFrame): Readonly<DebugFrame> {
  return deepFreeze(structuredClone(frame)) as Readonly<DebugFrame>;
}

export function snapshotHistorySignature(snapshot: Readonly<SimulationSnapshot>): string {
  return JSON.stringify({
    sessionId: snapshot.sessionId,
    status: snapshot.status,
    currentNodeId: snapshot.currentNodeId,
    timelineLength: snapshot.timeline.length,
    executedSteps: snapshot.stateInspector.executionContext.executedSteps ?? null,
    durationMs: snapshot.durationMs,
  });
}
