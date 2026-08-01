import type { WorkflowDocument } from "../../core/types";
import type { DebuggerInspectorState, DebuggerReplayState } from "./debugger-types";
import type {
  DebuggerBreakpoint,
  DebuggerBreakpointHit,
  DebuggerBreakpointKind,
  DebuggerWatchExpression,
} from "./debugger-advanced-types";

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
  list(scope: DebuggerKernelScope): DebuggerWatchExpression[];
  add(scope: DebuggerKernelScope, expression: string, label?: string | null): DebuggerWatchExpression;
  remove(scope: DebuggerKernelScope, watchId: string): void;
  toggle(scope: DebuggerKernelScope, watchId: string, enabled: boolean): void;
  setExpressionDraft(scope: DebuggerKernelScope, expression: string | null): void;
  getExpressionDraft(scope: DebuggerKernelScope): string | null;
  resetScope(scope: DebuggerKernelScope): void;
  disposeScope(scope: DebuggerKernelScope): void;
}

export interface DebuggerBreakpointsSlot {
  readonly kind: "breakpoints";
  list(scope: DebuggerKernelScope): DebuggerBreakpoint[];
  listHits(scope: DebuggerKernelScope): DebuggerBreakpointHit[];
  add(scope: DebuggerKernelScope, input: Omit<DebuggerBreakpoint, "id" | "hitCount">): DebuggerBreakpoint;
  remove(scope: DebuggerKernelScope, breakpointId: string): DebuggerBreakpoint | null;
  toggle(scope: DebuggerKernelScope, breakpointId: string, enabled: boolean): void;
  resetScope(scope: DebuggerKernelScope): void;
  disposeScope(scope: DebuggerKernelScope): void;
}

export interface DebuggerProfilerSlot {
  readonly kind: "profiler";
  resetScope(scope: DebuggerKernelScope): void;
  disposeScope(scope: DebuggerKernelScope): void;
}

export interface DebuggerCallStackSlot {
  readonly kind: "call-stack";
  resetScope(scope: DebuggerKernelScope): void;
  disposeScope(scope: DebuggerKernelScope): void;
}

export interface DebuggerReportsSlot {
  readonly kind: "reports";
  resetScope(scope: DebuggerKernelScope): void;
  disposeScope(scope: DebuggerKernelScope): void;
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

export type { DebuggerBreakpointKind };
