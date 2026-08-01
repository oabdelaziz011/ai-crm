import type { SimulationSnapshot } from "../../simulation/types/simulation-types";
import type { HistoryBufferState } from "../utilities/immutable-history-buffer";

export type DebuggerReplayMode = "live" | "replay";

export type DebugFrame = Readonly<{
  frameId: string;
  timestamp: string;
  stepNumber: number;
  executionDepth: number;
  branchDepth: number;
  parentFrameId: string | null;
  snapshot: Readonly<SimulationSnapshot>;
}>;

export type DebugSelectionState = {
  selectedFrame: Readonly<DebugFrame> | null;
  selectedNode: string | null;
  selectedVariable: string | null;
  selectedTimelineEvent: string | null;
  selectedExpression: string | null;
};

export type DebuggerReplayState = HistoryBufferState & {
  mode: DebuggerReplayMode;
};

export type DebuggerInspectorState = {
  selectedNodeId: string | null;
  selectedFrameIndex: number;
  currentNodeId: string | null;
  previousNodeId: string | null;
  nextNodeId: string | null;
  workflowState: SimulationSnapshot["status"];
};

export type ReplayFrameSummary = {
  frameIndex: number;
  frameId: string;
  timestamp: string;
  stepNumber: number;
  executionDepth: number;
  branchDepth: number;
  parentFrameId: string | null;
  status: SimulationSnapshot["status"];
  currentNodeId: string | null;
  currentNodeLabel: string | null;
  timelineLength: number;
  executedStepCount: number;
  capturedAt: string | null;
};

export type ReplayViewModel = {
  replay: DebuggerReplayState;
  inspector: DebuggerInspectorState;
  selection: DebugSelectionState;
  selectedSnapshot: Readonly<SimulationSnapshot> | null;
  frames: ReplayFrameSummary[];
};

export const DEFAULT_SNAPSHOT_HISTORY_CAPACITY = 256;

export function createDefaultDebugSelectionState(): DebugSelectionState {
  return {
    selectedFrame: null,
    selectedNode: null,
    selectedVariable: null,
    selectedTimelineEvent: null,
    selectedExpression: null,
  };
}
