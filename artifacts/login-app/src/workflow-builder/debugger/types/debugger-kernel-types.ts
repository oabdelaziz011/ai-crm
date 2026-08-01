import type { WorkflowDocument } from "../../core/types";
import type { DebuggerInspectorState, DebuggerReplayState } from "./debugger-types";

export type DebuggerKernelScope = {
  companyId: string;
  flowId: string;
};

export interface DebuggerReplaySlot {
  readonly kind: "replay";
  observeSnapshot(
    scope: DebuggerKernelScope,
    snapshot: Readonly<import("../../simulation/types/simulation-types").SimulationSnapshot>,
    graph?: WorkflowDocument | null,
  ): number | null;
  stepBack(scope: DebuggerKernelScope): boolean;
  stepForward(scope: DebuggerKernelScope): boolean;
  jump(scope: DebuggerKernelScope, index: number): boolean;
  reset(scope: DebuggerKernelScope): void;
  disposeScope(scope: DebuggerKernelScope): void;
  followLive(scope: DebuggerKernelScope): void;
  getReplayState(scope: DebuggerKernelScope): DebuggerReplayState;
  getSelectedSnapshot(scope: DebuggerKernelScope): Readonly<import("../../simulation/types/simulation-types").SimulationSnapshot> | null;
  listFrames(scope: DebuggerKernelScope): ReadonlyArray<Readonly<import("./debugger-types").DebugFrame>>;
}

export interface DebuggerInspectorSlot {
  readonly kind: "inspector";
  selectNode(scope: DebuggerKernelScope, nodeId: string | null): void;
  getState(
    scope: DebuggerKernelScope,
    liveSnapshot: Readonly<import("../../simulation/types/simulation-types").SimulationSnapshot>,
    replayMode: DebuggerReplayState["mode"],
    getCurrentSnapshot: () => Readonly<import("../../simulation/types/simulation-types").SimulationSnapshot> | null,
    frameIndex: number,
  ): DebuggerInspectorState;
}

export interface DebuggerWatchesSlot {
  readonly kind: "watches";
}

export interface DebuggerBreakpointsSlot {
  readonly kind: "breakpoints";
}

export interface DebuggerProfilerSlot {
  readonly kind: "profiler";
}

export interface DebuggerCallStackSlot {
  readonly kind: "call-stack";
}

export interface DebuggerReportsSlot {
  readonly kind: "reports";
}

export type DebuggerKernelSlots = {
  replay: DebuggerReplaySlot;
  inspector: DebuggerInspectorSlot;
  watches: DebuggerWatchesSlot;
  breakpoints: DebuggerBreakpointsSlot;
  profiler: DebuggerProfilerSlot;
  callStack: DebuggerCallStackSlot;
  reports: DebuggerReportsSlot;
};
