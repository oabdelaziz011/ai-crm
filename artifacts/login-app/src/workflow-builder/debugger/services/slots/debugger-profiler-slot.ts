import { buildSimulationScopeKey } from "../../../simulation/cache/simulation-scope-key";
import type { NodeProfilerEntry } from "../../types/debugger-advanced-types";
import type { DebugFrame } from "../../types/debugger-types";
import type { DebuggerKernelScope, DebuggerProfilerSlot } from "../../types/debugger-kernel-types";
import { buildNodeProfilerFromFrames } from "../../utilities/debugger-analysis-utils";
import type { DebuggerSlotEmitter } from "./debugger-breakpoints-slot";

type ProfilerScopeState = {
  frames: DebugFrame[];
};

function createProfilerScopeState(): ProfilerScopeState {
  return { frames: [] };
}

export class DebuggerProfilerSlotImpl implements DebuggerProfilerSlot {
  readonly kind = "profiler" as const;

  private readonly scopeStates = new Map<string, ProfilerScopeState>();

  private scopeKey(scope: DebuggerKernelScope): string {
    return buildSimulationScopeKey(scope.companyId, scope.flowId);
  }

  private getScopeState(scope: DebuggerKernelScope): ProfilerScopeState {
    const key = this.scopeKey(scope);
    let state = this.scopeStates.get(key);
    if (!state) {
      state = createProfilerScopeState();
      this.scopeStates.set(key, state);
    }
    return state;
  }

  observeFrame(scope: DebuggerKernelScope, frame: Readonly<DebugFrame>): void {
    const state = this.getScopeState(scope);
    if (state.frames.some((entry) => entry.frameId === frame.frameId)) return;
    state.frames.push(frame);
  }

  publishUpdate(
    scope: DebuggerKernelScope,
    frames: ReadonlyArray<Readonly<DebugFrame>>,
    emit: DebuggerSlotEmitter,
  ): NodeProfilerEntry[] {
    const entries = buildNodeProfilerFromFrames(frames.length > 0 ? frames : this.getScopeState(scope).frames);
    emit("ProfilerUpdated", { entries });
    return entries;
  }

  resetScope(scope: DebuggerKernelScope): void {
    this.scopeStates.set(this.scopeKey(scope), createProfilerScopeState());
  }

  disposeScope(scope: DebuggerKernelScope): void {
    this.scopeStates.delete(this.scopeKey(scope));
  }
}

export class DebuggerCallStackSlotImpl {
  readonly kind = "call-stack" as const;

  resetScope(_scope: DebuggerKernelScope): void {}

  disposeScope(_scope: DebuggerKernelScope): void {}
}

export class DebuggerReportsSlotImpl {
  readonly kind = "reports" as const;

  resetScope(_scope: DebuggerKernelScope): void {}

  disposeScope(_scope: DebuggerKernelScope): void {}
}
