import { buildSimulationScopeKey } from "../../../simulation/cache/simulation-scope-key";
import type { SimulationSnapshot } from "../../../simulation/types/simulation-types";
import type {
  DebuggerBreakpoint,
  DebuggerBreakpointHit,
  DebuggerBreakpointKind,
} from "../../types/debugger-advanced-types";
import type { DebuggerEventPayloadMap } from "../../types/debugger-event-types";
import type { DebuggerBreakpointsSlot, DebuggerKernelScope } from "../../types/debugger-kernel-types";
import { evaluateDebuggerExpression } from "../../utilities/debugger-expression-evaluator";

export type DebuggerSlotEmitter = <TType extends keyof DebuggerEventPayloadMap>(
  type: TType,
  payload: DebuggerEventPayloadMap[TType],
) => void;

type BreakpointScopeState = {
  breakpoints: DebuggerBreakpoint[];
  hits: DebuggerBreakpointHit[];
  nodeExecutionCounts: Map<string, number>;
  lastEvaluatedFrameIndex: number;
};

function createBreakpointScopeState(): BreakpointScopeState {
  return {
    breakpoints: [],
    hits: [],
    nodeExecutionCounts: new Map(),
    lastEvaluatedFrameIndex: -1,
  };
}

function createBreakpointId(): string {
  return `bp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readVariableValue(snapshot: Readonly<SimulationSnapshot>, key: string): unknown {
  return snapshot.variables[key];
}

export class DebuggerBreakpointsSlotImpl implements DebuggerBreakpointsSlot {
  readonly kind = "breakpoints" as const;

  private readonly scopeStates = new Map<string, BreakpointScopeState>();

  private scopeKey(scope: DebuggerKernelScope): string {
    return buildSimulationScopeKey(scope.companyId, scope.flowId);
  }

  private getScopeState(scope: DebuggerKernelScope): BreakpointScopeState {
    const key = this.scopeKey(scope);
    let state = this.scopeStates.get(key);
    if (!state) {
      state = createBreakpointScopeState();
      this.scopeStates.set(key, state);
    }
    return state;
  }

  list(scope: DebuggerKernelScope): DebuggerBreakpoint[] {
    return [...this.getScopeState(scope).breakpoints];
  }

  listHits(scope: DebuggerKernelScope): DebuggerBreakpointHit[] {
    return [...this.getScopeState(scope).hits];
  }

  add(scope: DebuggerKernelScope, input: Omit<DebuggerBreakpoint, "id" | "hitCount">): DebuggerBreakpoint {
    const breakpoint: DebuggerBreakpoint = {
      ...input,
      id: createBreakpointId(),
      hitCount: 0,
    };
    this.getScopeState(scope).breakpoints.push(breakpoint);
    return breakpoint;
  }

  remove(scope: DebuggerKernelScope, breakpointId: string): DebuggerBreakpoint | null {
    const state = this.getScopeState(scope);
    const breakpoint = state.breakpoints.find((entry) => entry.id === breakpointId) ?? null;
    state.breakpoints = state.breakpoints.filter((entry) => entry.id !== breakpointId);
    return breakpoint;
  }

  toggle(scope: DebuggerKernelScope, breakpointId: string, enabled: boolean): void {
    const breakpoint = this.getScopeState(scope).breakpoints.find((entry) => entry.id === breakpointId);
    if (breakpoint) breakpoint.enabled = enabled;
  }

  observeFrame(
    scope: DebuggerKernelScope,
    frameIndex: number,
    snapshot: Readonly<SimulationSnapshot>,
    emit: DebuggerSlotEmitter,
    live: boolean,
  ): DebuggerBreakpointHit[] {
    const state = this.getScopeState(scope);
    if (frameIndex <= state.lastEvaluatedFrameIndex) {
      return [];
    }
    state.lastEvaluatedFrameIndex = frameIndex;
    return this.evaluateAndEmit(scope, snapshot, emit, live, frameIndex);
  }

  evaluateLive(
    scope: DebuggerKernelScope,
    snapshot: Readonly<SimulationSnapshot>,
    emit: DebuggerSlotEmitter,
  ): DebuggerBreakpointHit[] {
    return this.evaluateAndEmit(scope, snapshot, emit, true, -1);
  }

  private evaluateAndEmit(
    scope: DebuggerKernelScope,
    snapshot: Readonly<SimulationSnapshot>,
    emit: DebuggerSlotEmitter,
    live: boolean,
    frameIndex: number,
  ): DebuggerBreakpointHit[] {
    const state = this.getScopeState(scope);

    if (snapshot.currentNodeId) {
      const currentCount = state.nodeExecutionCounts.get(snapshot.currentNodeId) ?? 0;
      state.nodeExecutionCounts.set(snapshot.currentNodeId, currentCount + 1);
    }

    const frameHits: DebuggerBreakpointHit[] = [];
    for (const breakpoint of state.breakpoints) {
      if (!breakpoint.enabled) continue;
      const hitReason = evaluateBreakpoint(breakpoint, snapshot, state.nodeExecutionCounts);
      if (!hitReason) continue;
      breakpoint.hitCount += 1;
      const record: DebuggerBreakpointHit = {
        breakpointId: breakpoint.id,
        frameIndex,
        nodeId: snapshot.currentNodeId,
        timestamp: snapshot.startedAt ?? new Date().toISOString(),
        reason: hitReason,
      };
      if (frameIndex >= 0) {
        state.hits.push(record);
      }
      frameHits.push(record);
      emit("BreakpointHit", { hit: record, live });
    }
    return frameHits;
  }

  resetScope(scope: DebuggerKernelScope): void {
    this.scopeStates.set(this.scopeKey(scope), createBreakpointScopeState());
  }

  disposeScope(scope: DebuggerKernelScope): void {
    this.scopeStates.delete(this.scopeKey(scope));
  }
}

function evaluateBreakpoint(
  breakpoint: DebuggerBreakpoint,
  snapshot: Readonly<SimulationSnapshot>,
  nodeExecutionCounts: Map<string, number>,
): string | null {
  switch (breakpoint.kind) {
    case "node":
      return breakpoint.nodeId && snapshot.currentNodeId === breakpoint.nodeId
        ? `Paused on node ${breakpoint.nodeId}`
        : null;
    case "variable_equals": {
      if (!breakpoint.variableKey) return null;
      const currentValue = readVariableValue(snapshot, breakpoint.variableKey);
      return currentValue == breakpoint.expectedValue
        ? `Variable ${breakpoint.variableKey} equals ${String(breakpoint.expectedValue)}`
        : null;
    }
    case "expression": {
      if (!breakpoint.expression) return null;
      const result = evaluateDebuggerExpression(breakpoint.expression, snapshot);
      if (result.error) return null;
      return result.value ? `Expression matched: ${breakpoint.expression}` : null;
    }
    case "execution_count": {
      if (!breakpoint.nodeId || breakpoint.executionCount == null) return null;
      const count = nodeExecutionCounts.get(breakpoint.nodeId) ?? 0;
      return count >= breakpoint.executionCount
        ? `Node ${breakpoint.nodeId} reached ${count} executions`
        : null;
    }
    default:
      return null;
  }
}

export function createDefaultBreakpoint(kind: DebuggerBreakpointKind): Omit<DebuggerBreakpoint, "id" | "hitCount"> {
  switch (kind) {
    case "node":
      return { kind, enabled: true, label: "Node breakpoint", nodeId: null };
    case "variable_equals":
      return { kind, enabled: true, label: "Variable breakpoint", variableKey: "", expectedValue: null };
    case "expression":
      return { kind, enabled: true, label: "Expression breakpoint", expression: "count > 0" };
    case "execution_count":
      return { kind, enabled: true, label: "Execution count breakpoint", nodeId: null, executionCount: 2 };
  }
}
