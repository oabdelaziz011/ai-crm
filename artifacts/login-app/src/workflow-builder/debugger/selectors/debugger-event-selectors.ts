import type {
  DebuggerBreakpointHit,
  DebuggerExpressionEvaluation,
  DebuggerWatchEvaluation,
  NodeProfilerEntry,
} from "../types/debugger-advanced-types";
import type { DebugSelectionState } from "../types/debugger-types";
import type { DebuggerEvent, DebuggerEventStream, DebuggerEventType } from "../types/debugger-event-types";
import { isDebuggerEventType } from "../types/debugger-event-types";

export function selectEventsByType<TType extends DebuggerEventType>(
  stream: DebuggerEventStream,
  type: TType,
): Extract<DebuggerEvent, { type: TType }>[] {
  return stream.events.filter((event): event is Extract<DebuggerEvent, { type: TType }> => event.type === type);
}

export function selectLatestEvent<TType extends DebuggerEventType>(
  stream: DebuggerEventStream,
  type: TType,
): Extract<DebuggerEvent, { type: TType }> | null {
  for (let index = stream.events.length - 1; index >= 0; index -= 1) {
    const event = stream.events[index];
    if (event?.type === type) {
      return event as Extract<DebuggerEvent, { type: TType }>;
    }
  }
  return null;
}

export function selectLatestBreakpointHit(stream: DebuggerEventStream): DebuggerBreakpointHit | null {
  const event = selectLatestEvent(stream, "BreakpointHit");
  return event?.payload.hit ?? null;
}

export function selectLatestLiveBreakpointHit(stream: DebuggerEventStream): DebuggerBreakpointHit | null {
  for (let index = stream.events.length - 1; index >= 0; index -= 1) {
    const event = stream.events[index];
    if (!event) continue;
    if (isDebuggerEventType(event, "BreakpointHit") && event.payload.live) {
      return event.payload.hit;
    }
  }
  return null;
}

export function selectLatestProfilerUpdate(stream: DebuggerEventStream): NodeProfilerEntry[] {
  return selectLatestEvent(stream, "ProfilerUpdated")?.payload.entries ?? [];
}

export function selectLatestWatchEvaluations(stream: DebuggerEventStream): DebuggerWatchEvaluation[] {
  const evaluations = new Map<string, DebuggerWatchEvaluation>();
  for (const event of stream.events) {
    if (isDebuggerEventType(event, "WatchEvaluated")) {
      evaluations.set(event.payload.evaluation.watchId, event.payload.evaluation);
    }
    if (isDebuggerEventType(event, "WatchChanged")) {
      evaluations.set(event.payload.evaluation.watchId, event.payload.evaluation);
    }
  }
  return [...evaluations.values()];
}

export function selectLatestExpressionEvaluation(stream: DebuggerEventStream): DebuggerExpressionEvaluation | null {
  return selectLatestEvent(stream, "ExpressionEvaluated")?.payload.result ?? null;
}

export function selectLatestReplayPosition(stream: DebuggerEventStream): {
  index: number;
  mode: "live" | "replay";
  frameId: string | null;
} | null {
  const event = selectLatestEvent(stream, "ReplayPositionChanged");
  if (!event) return null;
  return event.payload;
}

export function selectLatestSelection(stream: DebuggerEventStream): DebugSelectionState | null {
  return selectLatestEvent(stream, "SelectionChanged")?.payload.selection ?? null;
}

export function selectBreakpointHits(stream: DebuggerEventStream): DebuggerBreakpointHit[] {
  return selectEventsByType(stream, "BreakpointHit").map((event) => event.payload.hit);
}

export function areEventsInOrder(stream: DebuggerEventStream): boolean {
  for (let index = 1; index < stream.events.length; index += 1) {
    const previous = stream.events[index - 1];
    const current = stream.events[index];
    if (!previous || !current) return false;
    if (current.sequence <= previous.sequence) return false;
    if (current.generation !== previous.generation) return false;
  }
  return true;
}
