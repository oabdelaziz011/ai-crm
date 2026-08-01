import { buildSimulationScopeKey } from "../../simulation/cache/simulation-scope-key";
import type { WorkflowDocument } from "../../core/types";
import type { SimulationSnapshot } from "../../simulation/types/simulation-types";
import type { DebugFrame, DebugSelectionState, DebuggerInspectorState, DebuggerReplayState } from "../types/debugger-types";
import { createDefaultDebugSelectionState } from "../types/debugger-types";
import type { DebuggerKernelScope, DebuggerKernelSlots } from "../types/debugger-kernel-types";
import type { DebuggerReplayRepository } from "../repositories/debugger-replay-repository";
import {
  createBreakpointsSlotPlaceholder,
  createCallStackSlotPlaceholder,
  createProfilerSlotPlaceholder,
  createReportsSlotPlaceholder,
  createWatchesSlotPlaceholder,
  DebuggerInspectorSlotImpl,
} from "./slots/debugger-inspector-slot";
import { DebuggerReplaySlotImpl } from "./slots/debugger-replay-slot";

type ScopeSelectionState = DebugSelectionState;

export class DebuggerKernel {
  readonly replay: DebuggerReplaySlotImpl;
  readonly inspector: DebuggerInspectorSlotImpl;
  readonly watches: DebuggerKernelSlots["watches"];
  readonly breakpoints: DebuggerKernelSlots["breakpoints"];
  readonly profiler: DebuggerKernelSlots["profiler"];
  readonly callStack: DebuggerKernelSlots["callStack"];
  readonly reports: DebuggerKernelSlots["reports"];

  private readonly selectionStates = new Map<string, ScopeSelectionState>();

  constructor(repository: DebuggerReplayRepository) {
    this.replay = new DebuggerReplaySlotImpl(repository);
    this.inspector = new DebuggerInspectorSlotImpl();
    this.watches = createWatchesSlotPlaceholder();
    this.breakpoints = createBreakpointsSlotPlaceholder();
    this.profiler = createProfilerSlotPlaceholder();
    this.callStack = createCallStackSlotPlaceholder();
    this.reports = createReportsSlotPlaceholder();
  }

  private scopeKey(scope: DebuggerKernelScope): string {
    return buildSimulationScopeKey(scope.companyId, scope.flowId);
  }

  private resolveSelectionState(scope: DebuggerKernelScope): ScopeSelectionState {
    const key = this.scopeKey(scope);
    let state = this.selectionStates.get(key);
    if (!state) {
      state = createDefaultDebugSelectionState();
      this.selectionStates.set(key, state);
    }
    return state;
  }

  getSelectionState(scope: DebuggerKernelScope): DebugSelectionState {
    return { ...this.resolveSelectionState(scope) };
  }

  observeSnapshot(
    scope: DebuggerKernelScope,
    snapshot: Readonly<SimulationSnapshot>,
    graph?: WorkflowDocument | null,
  ): number | null {
    const index = this.replay.observeSnapshot(scope, snapshot, graph);
    this.inspector.syncLiveNode(scope, snapshot, this.replay.getReplayState(scope).mode);
    return index;
  }

  stepBack(scope: DebuggerKernelScope): boolean {
    const moved = this.replay.stepBack(scope);
    if (moved) {
      this.inspector.syncReplayNode(scope, this.replay.getSelectedSnapshot(scope));
    }
    return moved;
  }

  stepForward(scope: DebuggerKernelScope): boolean {
    const moved = this.replay.stepForward(scope);
    if (moved) {
      const replayState = this.replay.getReplayState(scope);
      this.inspector.syncReplayNode(scope, this.replay.getSelectedSnapshot(scope));
      if (replayState.mode === "live") {
        const currentFrame = this.replay.listFrames(scope).at(-1);
        if (currentFrame) {
          this.inspector.syncLiveNode(scope, currentFrame.snapshot, replayState.mode);
        }
      }
    }
    return moved;
  }

  jump(scope: DebuggerKernelScope, index: number): boolean {
    const moved = this.replay.jump(scope, index);
    if (moved) {
      this.inspector.syncReplayNode(scope, this.replay.getSelectedSnapshot(scope));
    }
    return moved;
  }

  reset(scope: DebuggerKernelScope): void {
    this.replay.reset(scope);
    this.inspector.resetScope(scope);
    this.selectionStates.set(this.scopeKey(scope), createDefaultDebugSelectionState());
  }

  disposeScope(scope: DebuggerKernelScope): void {
    this.replay.disposeScope(scope);
    this.inspector.disposeScope(scope);
    this.selectionStates.delete(this.scopeKey(scope));
  }

  selectFrame(scope: DebuggerKernelScope, frameId: string | null): void {
    const selection = this.resolveSelectionState(scope);
    if (!frameId) {
      selection.selectedFrame = null;
      return;
    }

    selection.selectedFrame = this.replay.listFrames(scope).find((frame) => frame.frameId === frameId) ?? null;
  }

  selectNode(scope: DebuggerKernelScope, nodeId: string | null): void {
    this.inspector.selectNode(scope, nodeId);
    this.resolveSelectionState(scope).selectedNode = nodeId;
  }

  selectVariable(scope: DebuggerKernelScope, variableKey: string | null): void {
    this.resolveSelectionState(scope).selectedVariable = variableKey;
  }

  selectTimelineEvent(scope: DebuggerKernelScope, eventId: string | null): void {
    this.resolveSelectionState(scope).selectedTimelineEvent = eventId;
  }

  selectExpression(scope: DebuggerKernelScope, expressionId: string | null): void {
    this.resolveSelectionState(scope).selectedExpression = expressionId;
  }

  followLive(scope: DebuggerKernelScope): void {
    this.replay.followLive(scope);
    const currentFrame = this.replay.listFrames(scope).at(-1);
    if (currentFrame) {
      this.inspector.syncLiveNode(scope, currentFrame.snapshot, "live");
    }
  }

  getReplayState(scope: DebuggerKernelScope): DebuggerReplayState {
    return this.replay.getReplayState(scope);
  }

  getSelectedSnapshot(scope: DebuggerKernelScope): Readonly<SimulationSnapshot> | null {
    return this.replay.getSelectedSnapshot(scope);
  }

  getInspectorState(scope: DebuggerKernelScope, liveSnapshot: Readonly<SimulationSnapshot>): DebuggerInspectorState {
    const replayState = this.replay.getReplayState(scope);
    return this.inspector.getState(
      scope,
      liveSnapshot,
      replayState.mode,
      () => this.replay.getSelectedSnapshot(scope),
      replayState.index,
    );
  }

  listFrames(scope: DebuggerKernelScope): ReadonlyArray<Readonly<DebugFrame>> {
    return this.replay.listFrames(scope);
  }
}
