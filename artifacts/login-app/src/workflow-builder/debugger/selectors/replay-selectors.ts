import type { SimulationSnapshot } from "../../simulation/types/simulation-types";
import type { DebugFrame, DebuggerInspectorState, DebuggerReplayState, ReplayFrameSummary, ReplayViewModel } from "../types/debugger-types";
import type { DebugSelectionState } from "../types/debugger-types";

export function buildReplayFrameSummary(frame: Readonly<DebugFrame>, frameIndex: number): ReplayFrameSummary {
  const snapshot = frame.snapshot;
  const currentEntry = snapshot.pathExplorer.find((entry) => entry.nodeId === snapshot.currentNodeId);
  const executedStepCount = snapshot.pathExplorer.filter((entry) => entry.status === "executed").length;

  return {
    frameIndex,
    frameId: frame.frameId,
    timestamp: frame.timestamp,
    stepNumber: frame.stepNumber,
    executionDepth: frame.executionDepth,
    branchDepth: frame.branchDepth,
    parentFrameId: frame.parentFrameId,
    status: snapshot.status,
    currentNodeId: snapshot.currentNodeId,
    currentNodeLabel: currentEntry?.label ?? snapshot.stateInspector.currentNode?.label ?? null,
    timelineLength: snapshot.timeline.length,
    executedStepCount,
    capturedAt: snapshot.startedAt,
  };
}

export function buildReplayFrameSummaries(frames: ReadonlyArray<Readonly<DebugFrame>>): ReplayFrameSummary[] {
  return frames.map((frame, frameIndex) => buildReplayFrameSummary(frame, frameIndex));
}

export function buildReplayViewModel(input: {
  replay: DebuggerReplayState;
  inspector: DebuggerInspectorState;
  selection: DebugSelectionState;
  selectedSnapshot: Readonly<SimulationSnapshot> | null;
  frames: ReadonlyArray<Readonly<DebugFrame>>;
}): ReplayViewModel {
  return {
    replay: input.replay,
    inspector: input.inspector,
    selection: input.selection,
    selectedSnapshot: input.selectedSnapshot,
    frames: buildReplayFrameSummaries(input.frames),
  };
}

export function resolveDisplayedSnapshot(input: {
  liveSnapshot: Readonly<SimulationSnapshot>;
  replaySnapshot: Readonly<SimulationSnapshot> | null;
  mode: DebuggerReplayState["mode"];
}): Readonly<SimulationSnapshot> {
  return input.mode === "replay" && input.replaySnapshot ? input.replaySnapshot : input.liveSnapshot;
}
