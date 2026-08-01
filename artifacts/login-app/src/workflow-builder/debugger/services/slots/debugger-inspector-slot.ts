import { buildSimulationScopeKey } from "../../../simulation/cache/simulation-scope-key";
import type { SimulationSnapshot } from "../../../simulation/types/simulation-types";
import type { DebuggerInspectorState, DebuggerReplayState } from "../../types/debugger-types";
import type { DebuggerInspectorSlot, DebuggerKernelScope } from "../../types/debugger-kernel-types";

type InspectorScopeState = {
  selectedNodeId: string | null;
};

function createInspectorScopeState(): InspectorScopeState {
  return {
    selectedNodeId: null,
  };
}

export class DebuggerInspectorSlotImpl implements DebuggerInspectorSlot {
  readonly kind = "inspector" as const;

  private readonly scopeStates = new Map<string, InspectorScopeState>();

  private scopeKey(scope: DebuggerKernelScope): string {
    return buildSimulationScopeKey(scope.companyId, scope.flowId);
  }

  private getScopeState(scope: DebuggerKernelScope): InspectorScopeState {
    const key = this.scopeKey(scope);
    let state = this.scopeStates.get(key);
    if (!state) {
      state = createInspectorScopeState();
      this.scopeStates.set(key, state);
    }
    return state;
  }

  selectNode(scope: DebuggerKernelScope, nodeId: string | null): void {
    this.getScopeState(scope).selectedNodeId = nodeId;
  }

  resetScope(scope: DebuggerKernelScope): void {
    this.scopeStates.set(this.scopeKey(scope), createInspectorScopeState());
  }

  disposeScope(scope: DebuggerKernelScope): void {
    this.scopeStates.delete(this.scopeKey(scope));
  }

  syncLiveNode(scope: DebuggerKernelScope, snapshot: Readonly<SimulationSnapshot>, replayMode: DebuggerReplayState["mode"]): void {
    if (replayMode === "live") {
      this.getScopeState(scope).selectedNodeId = snapshot.currentNodeId;
    }
  }

  syncReplayNode(scope: DebuggerKernelScope, snapshot: Readonly<SimulationSnapshot> | null): void {
    if (snapshot) {
      this.getScopeState(scope).selectedNodeId = snapshot.currentNodeId;
    }
  }

  getState(
    scope: DebuggerKernelScope,
    liveSnapshot: Readonly<SimulationSnapshot>,
    replayMode: DebuggerReplayState["mode"],
    getCurrentSnapshot: () => Readonly<SimulationSnapshot> | null,
    frameIndex: number,
  ): DebuggerInspectorState {
    const snapshot = replayMode === "replay" ? getCurrentSnapshot() ?? liveSnapshot : liveSnapshot;

    const executedNodeIds = snapshot.pathExplorer
      .filter((entry) => entry.status === "executed" || entry.status === "current")
      .map((entry) => entry.nodeId);

    const currentIndex = snapshot.currentNodeId ? executedNodeIds.indexOf(snapshot.currentNodeId) : -1;

    return {
      selectedNodeId: this.getScopeState(scope).selectedNodeId,
      selectedFrameIndex: frameIndex,
      currentNodeId: snapshot.currentNodeId,
      previousNodeId: currentIndex > 0 ? executedNodeIds[currentIndex - 1] ?? null : null,
      nextNodeId:
        currentIndex >= 0 && currentIndex < executedNodeIds.length - 1
          ? executedNodeIds[currentIndex + 1] ?? null
          : null,
      workflowState: snapshot.status,
    };
  }
}

export function createWatchesSlotPlaceholder() {
  return { kind: "watches" as const };
}

export function createBreakpointsSlotPlaceholder() {
  return { kind: "breakpoints" as const };
}

export function createProfilerSlotPlaceholder() {
  return { kind: "profiler" as const };
}

export function createCallStackSlotPlaceholder() {
  return { kind: "call-stack" as const };
}

export function createReportsSlotPlaceholder() {
  return { kind: "reports" as const };
}
