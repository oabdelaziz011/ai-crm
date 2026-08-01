import { buildSimulationScopeKey } from "../../../simulation/cache/simulation-scope-key";
import type { WorkflowDocument } from "../../../core/types";
import type { SimulationSnapshot } from "../../../simulation/types/simulation-types";
import type { DebugFrame, DebuggerReplayMode, DebuggerReplayState } from "../../types/debugger-types";
import type { DebuggerKernelScope, DebuggerReplaySlot } from "../../types/debugger-kernel-types";
import { buildDebugFrame, snapshotHistorySignature } from "../../utilities/debug-frame-utils";
import type { DebuggerReplayRepository } from "../../repositories/debugger-replay-repository";

type ReplayScopeState = {
  mode: DebuggerReplayMode;
  lastObservedSignature: string | null;
};

function createReplayScopeState(): ReplayScopeState {
  return {
    mode: "live",
    lastObservedSignature: null,
  };
}

export class DebuggerReplaySlotImpl implements DebuggerReplaySlot {
  readonly kind = "replay" as const;

  private readonly scopeStates = new Map<string, ReplayScopeState>();

  constructor(private readonly repository: DebuggerReplayRepository) {}

  private scopeKey(scope: DebuggerKernelScope): string {
    return buildSimulationScopeKey(scope.companyId, scope.flowId);
  }

  private getScopeState(scope: DebuggerKernelScope): ReplayScopeState {
    const key = this.scopeKey(scope);
    let state = this.scopeStates.get(key);
    if (!state) {
      state = createReplayScopeState();
      this.scopeStates.set(key, state);
    }
    return state;
  }

  observeSnapshot(
    scope: DebuggerKernelScope,
    snapshot: Readonly<SimulationSnapshot>,
    graph?: WorkflowDocument | null,
  ): number | null {
    if (!scope.companyId || !scope.flowId) return null;

    const scopeState = this.getScopeState(scope);
    const signature = snapshotHistorySignature(snapshot);
    if (signature === scopeState.lastObservedSignature) {
      return this.repository.getState(scope.companyId, scope.flowId).index;
    }

    scopeState.lastObservedSignature = signature;
    const frames = this.repository.list(scope.companyId, scope.flowId);
    const parentFrameId = frames.at(-1)?.frameId ?? null;
    const frame = buildDebugFrame(snapshot, frames.length, parentFrameId, graph);
    return this.repository.append(scope.companyId, scope.flowId, frame);
  }

  stepBack(scope: DebuggerKernelScope): boolean {
    const moved = this.repository.previous(scope.companyId, scope.flowId);
    if (moved) this.getScopeState(scope).mode = "replay";
    return moved;
  }

  stepForward(scope: DebuggerKernelScope): boolean {
    const moved = this.repository.next(scope.companyId, scope.flowId);
    if (moved) {
      const state = this.repository.getState(scope.companyId, scope.flowId);
      this.getScopeState(scope).mode = state.index === state.count - 1 ? "live" : "replay";
    }
    return moved;
  }

  jump(scope: DebuggerKernelScope, index: number): boolean {
    const moved = this.repository.jump(scope.companyId, scope.flowId, index);
    if (moved) {
      const scopeState = this.getScopeState(scope);
      const state = this.repository.getState(scope.companyId, scope.flowId);
      scopeState.mode = state.index === state.count - 1 ? "live" : "replay";
    }
    return moved;
  }

  reset(scope: DebuggerKernelScope): void {
    this.repository.reset(scope.companyId, scope.flowId);
    this.scopeStates.set(this.scopeKey(scope), createReplayScopeState());
  }

  disposeScope(scope: DebuggerKernelScope): void {
    this.repository.disposeScope(scope.companyId, scope.flowId);
    this.scopeStates.delete(this.scopeKey(scope));
  }

  followLive(scope: DebuggerKernelScope): void {
    const scopeState = this.getScopeState(scope);
    const state = this.repository.getState(scope.companyId, scope.flowId);
    if (state.count === 0) {
      scopeState.mode = "live";
      return;
    }
    this.repository.jump(scope.companyId, scope.flowId, state.count - 1);
    scopeState.mode = "live";
  }

  getReplayState(scope: DebuggerKernelScope): DebuggerReplayState {
    return {
      ...this.repository.getState(scope.companyId, scope.flowId),
      mode: this.getScopeState(scope).mode,
    };
  }

  getSelectedSnapshot(scope: DebuggerKernelScope): Readonly<SimulationSnapshot> | null {
    if (this.getScopeState(scope).mode === "replay") {
      return this.repository.current(scope.companyId, scope.flowId)?.snapshot ?? null;
    }
    return null;
  }

  listFrames(scope: DebuggerKernelScope): ReadonlyArray<Readonly<DebugFrame>> {
    return this.repository.list(scope.companyId, scope.flowId);
  }
}
