import type { DebuggerKernelScope } from "./debugger-kernel-types";
import type {
  DebuggerBreakpointHit,
  DebuggerExpressionEvaluation,
  DebuggerWatchEvaluation,
  NodeProfilerEntry,
} from "./debugger-advanced-types";
import type { DebugSelectionState, DebuggerReplayMode } from "./debugger-types";

export type DebuggerEventType =
  | "BreakpointHit"
  | "WatchEvaluated"
  | "WatchChanged"
  | "ExpressionEvaluated"
  | "ProfilerUpdated"
  | "ReplayPositionChanged"
  | "SelectionChanged";

export type DebuggerEventPayloadMap = {
  BreakpointHit: {
    hit: DebuggerBreakpointHit;
    live: boolean;
  };
  WatchEvaluated: {
    evaluation: DebuggerWatchEvaluation;
  };
  WatchChanged: {
    watchId: string;
    previousDisplayValue: string;
    evaluation: DebuggerWatchEvaluation;
  };
  ExpressionEvaluated: {
    result: DebuggerExpressionEvaluation;
  };
  ProfilerUpdated: {
    entries: NodeProfilerEntry[];
  };
  ReplayPositionChanged: {
    index: number;
    mode: DebuggerReplayMode;
    frameId: string | null;
  };
  SelectionChanged: {
    selection: DebugSelectionState;
  };
};

type DebuggerEventBase = {
  id: string;
  scope: DebuggerKernelScope;
  sequence: number;
  generation: number;
  timestamp: string;
};

export type DebuggerEvent = {
  [TType in DebuggerEventType]: DebuggerEventBase & {
    type: TType;
    payload: DebuggerEventPayloadMap[TType];
  };
}[DebuggerEventType];

export type DebuggerEventListener = (event: DebuggerEvent) => void;

export type DebuggerEventStream = Readonly<{
  generation: number;
  events: ReadonlyArray<DebuggerEvent>;
}>;

export function isDebuggerEventType<TType extends DebuggerEventType>(
  event: DebuggerEvent,
  type: TType,
): event is Extract<DebuggerEvent, { type: TType }> {
  return event.type === type;
}
