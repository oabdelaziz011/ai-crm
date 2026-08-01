import { buildSimulationScopeKey } from "../../../simulation/cache/simulation-scope-key";
import type { SimulationSnapshot } from "../../../simulation/types/simulation-types";
import type { DebuggerWatchExpression } from "../../types/debugger-advanced-types";
import type { DebuggerEventPayloadMap } from "../../types/debugger-event-types";
import type { DebuggerKernelScope, DebuggerWatchesSlot } from "../../types/debugger-kernel-types";
import { evaluateDebuggerExpression } from "../../utilities/debugger-expression-evaluator";
import type { DebuggerSlotEmitter } from "./debugger-breakpoints-slot";

type WatchScopeState = {
  watches: DebuggerWatchExpression[];
  expressionDraft: string | null;
  lastDisplayValues: Map<string, string>;
};

function createWatchScopeState(): WatchScopeState {
  return {
    watches: [],
    expressionDraft: null,
    lastDisplayValues: new Map(),
  };
}

function createWatchId(): string {
  return `watch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class DebuggerWatchesSlotImpl implements DebuggerWatchesSlot {
  readonly kind = "watches" as const;

  private readonly scopeStates = new Map<string, WatchScopeState>();

  private scopeKey(scope: DebuggerKernelScope): string {
    return buildSimulationScopeKey(scope.companyId, scope.flowId);
  }

  private getScopeState(scope: DebuggerKernelScope): WatchScopeState {
    const key = this.scopeKey(scope);
    let state = this.scopeStates.get(key);
    if (!state) {
      state = createWatchScopeState();
      this.scopeStates.set(key, state);
    }
    return state;
  }

  list(scope: DebuggerKernelScope): DebuggerWatchExpression[] {
    return [...this.getScopeState(scope).watches];
  }

  add(scope: DebuggerKernelScope, expression: string, label?: string | null): DebuggerWatchExpression {
    const watch: DebuggerWatchExpression = {
      id: createWatchId(),
      expression,
      enabled: true,
      label: label ?? null,
    };
    this.getScopeState(scope).watches.push(watch);
    return watch;
  }

  remove(scope: DebuggerKernelScope, watchId: string): void {
    const state = this.getScopeState(scope);
    state.watches = state.watches.filter((entry) => entry.id !== watchId);
    state.lastDisplayValues.delete(watchId);
  }

  toggle(scope: DebuggerKernelScope, watchId: string, enabled: boolean): void {
    const watch = this.getScopeState(scope).watches.find((entry) => entry.id === watchId);
    if (watch) watch.enabled = enabled;
  }

  setExpressionDraft(scope: DebuggerKernelScope, expression: string | null): void {
    this.getScopeState(scope).expressionDraft = expression;
  }

  getExpressionDraft(scope: DebuggerKernelScope): string | null {
    return this.getScopeState(scope).expressionDraft;
  }

  processSnapshot(
    scope: DebuggerKernelScope,
    snapshot: Readonly<SimulationSnapshot>,
    emit: DebuggerSlotEmitter,
  ): void {
    const state = this.getScopeState(scope);

    for (const watch of state.watches) {
      const evaluation = this.buildEvaluation(watch, snapshot);
      emit("WatchEvaluated", { evaluation });

      const previousDisplayValue = state.lastDisplayValues.get(watch.id);
      if (previousDisplayValue != null && previousDisplayValue !== evaluation.displayValue) {
        emit("WatchChanged", {
          watchId: watch.id,
          previousDisplayValue,
          evaluation,
        });
      }
      state.lastDisplayValues.set(watch.id, evaluation.displayValue);
    }

    const expression = state.expressionDraft;
    if (expression) {
      const result = evaluateDebuggerExpression(expression, snapshot);
      emit("ExpressionEvaluated", {
        result: {
          expression,
          displayValue: result.displayValue,
          error: result.error,
        },
      });
    }
  }

  private buildEvaluation(watch: DebuggerWatchExpression, snapshot: Readonly<SimulationSnapshot>) {
    if (!watch.enabled) {
      return {
        watchId: watch.id,
        expression: watch.expression,
        label: watch.label,
        enabled: false,
        displayValue: "—",
        error: null,
      };
    }
    const result = evaluateDebuggerExpression(watch.expression, snapshot);
    return {
      watchId: watch.id,
      expression: watch.expression,
      label: watch.label,
      enabled: true,
      displayValue: result.displayValue,
      error: result.error,
    };
  }

  resetScope(scope: DebuggerKernelScope): void {
    this.scopeStates.set(this.scopeKey(scope), createWatchScopeState());
  }

  disposeScope(scope: DebuggerKernelScope): void {
    this.scopeStates.delete(this.scopeKey(scope));
  }
}

export type { DebuggerEventPayloadMap };
