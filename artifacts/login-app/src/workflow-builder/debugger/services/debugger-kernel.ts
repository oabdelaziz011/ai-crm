import { buildSimulationScopeKey } from "../../simulation/cache/simulation-scope-key";
import type { WorkflowDocument } from "../../core/types";
import type { SimulationSnapshot } from "../../simulation/types/simulation-types";
import type { DebugFrame, DebugSelectionState, DebuggerInspectorState, DebuggerReplayState } from "../types/debugger-types";
import { createDefaultDebugSelectionState } from "../types/debugger-types";
import type { DebuggerKernelScope, DebuggerKernelSlots } from "../types/debugger-kernel-types";
import type { DebuggerBreakpointKind } from "../types/debugger-kernel-types";
import type { DebuggerEventPayloadMap } from "../types/debugger-event-types";
import type { DebuggerReplayRepository } from "../repositories/debugger-replay-repository";
import { DebuggerInspectorSlotImpl } from "./slots/debugger-inspector-slot";
import { DebuggerReplaySlotImpl } from "./slots/debugger-replay-slot";
import { DebuggerBreakpointsSlotImpl, createDefaultBreakpoint } from "./slots/debugger-breakpoints-slot";
import type { DebuggerSlotEmitter } from "./slots/debugger-breakpoints-slot";
import { DebuggerWatchesSlotImpl } from "./slots/debugger-watches-slot";
import {
  DebuggerCallStackSlotImpl,
  DebuggerProfilerSlotImpl,
  DebuggerReportsSlotImpl,
} from "./slots/debugger-profiler-slot";
import { DebuggerEventBus } from "./debugger-event-bus";

type ScopeSelectionState = DebugSelectionState;

export class DebuggerKernel {
  readonly replay: DebuggerReplaySlotImpl;
  readonly inspector: DebuggerInspectorSlotImpl;
  readonly watches: DebuggerWatchesSlotImpl;
  readonly breakpoints: DebuggerBreakpointsSlotImpl;
  readonly profiler: DebuggerProfilerSlotImpl;
  readonly callStack: DebuggerCallStackSlotImpl;
  readonly reports: DebuggerReportsSlotImpl;
  readonly events: DebuggerEventBus;

  private readonly selectionStates = new Map<string, ScopeSelectionState>();

  constructor(repository: DebuggerReplayRepository, eventBus?: DebuggerEventBus) {
    this.events = eventBus ?? new DebuggerEventBus();
    this.replay = new DebuggerReplaySlotImpl(repository);
    this.inspector = new DebuggerInspectorSlotImpl();
    this.watches = new DebuggerWatchesSlotImpl();
    this.breakpoints = new DebuggerBreakpointsSlotImpl();
    this.profiler = new DebuggerProfilerSlotImpl();
    this.callStack = new DebuggerCallStackSlotImpl();
    this.reports = new DebuggerReportsSlotImpl();
  }

  private scopeKey(scope: DebuggerKernelScope): string {
    return buildSimulationScopeKey(scope.companyId, scope.flowId);
  }

  private createEmitter(scope: DebuggerKernelScope): DebuggerSlotEmitter {
    return <TType extends keyof DebuggerEventPayloadMap>(type: TType, payload: DebuggerEventPayloadMap[TType]) => {
      this.events.dispatch(scope, type, payload);
    };
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

  private emitSelectionChanged(scope: DebuggerKernelScope): void {
    this.events.dispatch(scope, "SelectionChanged", {
      selection: this.getSelectionState(scope),
    });
  }

  private emitReplayPositionChanged(scope: DebuggerKernelScope): void {
    const replayState = this.replay.getReplayState(scope);
    const frame = replayState.index >= 0 ? this.replay.listFrames(scope)[replayState.index] : null;
    this.events.dispatch(scope, "ReplayPositionChanged", {
      index: replayState.index,
      mode: replayState.mode,
      frameId: frame?.frameId ?? null,
    });
  }

  getSelectionState(scope: DebuggerKernelScope): DebugSelectionState {
    return { ...this.resolveSelectionState(scope) };
  }

  getEventStream(scope: DebuggerKernelScope) {
    return this.events.getStream(scope);
  }

  subscribe(scope: DebuggerKernelScope, listener: (event: import("../types/debugger-event-types").DebuggerEvent) => void) {
    return this.events.subscribe(scope, listener);
  }

  observeSnapshot(
    scope: DebuggerKernelScope,
    snapshot: Readonly<SimulationSnapshot>,
    graph?: WorkflowDocument | null,
  ): number | null {
    const previousIndex = this.replay.getReplayState(scope).index;
    const index = this.replay.observeSnapshot(scope, snapshot, graph);
    this.inspector.syncLiveNode(scope, snapshot, this.replay.getReplayState(scope).mode);

    const emit = this.createEmitter(scope);
    const replayState = this.replay.getReplayState(scope);
    const frames = this.replay.listFrames(scope);
    const isLive = replayState.mode === "live";

    if (index != null && index >= 0) {
      const frame = frames[index];
      if (frame) {
        this.profiler.observeFrame(scope, frame);
        this.breakpoints.observeFrame(scope, index, snapshot, emit, isLive);
        this.profiler.publishUpdate(scope, frames, emit);
      }
    } else if (isLive) {
      this.breakpoints.evaluateLive(scope, snapshot, emit);
    }

    this.watches.processSnapshot(scope, snapshot, emit);

    if (index !== previousIndex || (index != null && index >= 0)) {
      this.emitReplayPositionChanged(scope);
    }

    return index;
  }

  stepBack(scope: DebuggerKernelScope): boolean {
    const moved = this.replay.stepBack(scope);
    if (moved) {
      this.inspector.syncReplayNode(scope, this.replay.getSelectedSnapshot(scope));
      this.emitReplayPositionChanged(scope);
      const snapshot = this.replay.getSelectedSnapshot(scope);
      if (snapshot) {
        this.watches.processSnapshot(scope, snapshot, this.createEmitter(scope));
        this.profiler.publishUpdate(scope, this.replay.listFrames(scope), this.createEmitter(scope));
      }
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
      this.emitReplayPositionChanged(scope);
      const snapshot = this.replay.getSelectedSnapshot(scope);
      if (snapshot) {
        this.watches.processSnapshot(scope, snapshot, this.createEmitter(scope));
        this.profiler.publishUpdate(scope, this.replay.listFrames(scope), this.createEmitter(scope));
      }
    }
    return moved;
  }

  jump(scope: DebuggerKernelScope, index: number): boolean {
    const moved = this.replay.jump(scope, index);
    if (moved) {
      this.inspector.syncReplayNode(scope, this.replay.getSelectedSnapshot(scope));
      this.emitReplayPositionChanged(scope);
      const snapshot = this.replay.getSelectedSnapshot(scope);
      if (snapshot) {
        this.watches.processSnapshot(scope, snapshot, this.createEmitter(scope));
        this.profiler.publishUpdate(scope, this.replay.listFrames(scope), this.createEmitter(scope));
      }
    }
    return moved;
  }

  reset(scope: DebuggerKernelScope): void {
    this.replay.reset(scope);
    this.inspector.resetScope(scope);
    this.watches.resetScope(scope);
    this.breakpoints.resetScope(scope);
    this.profiler.resetScope(scope);
    this.callStack.resetScope(scope);
    this.reports.resetScope(scope);
    this.events.resetScope(scope);
    this.selectionStates.set(this.scopeKey(scope), createDefaultDebugSelectionState());
    this.emitSelectionChanged(scope);
    this.emitReplayPositionChanged(scope);
  }

  disposeScope(scope: DebuggerKernelScope): void {
    this.replay.disposeScope(scope);
    this.inspector.disposeScope(scope);
    this.watches.disposeScope(scope);
    this.breakpoints.disposeScope(scope);
    this.profiler.disposeScope(scope);
    this.callStack.disposeScope(scope);
    this.reports.disposeScope(scope);
    this.events.disposeScope(scope);
    this.selectionStates.delete(this.scopeKey(scope));
  }

  selectFrame(scope: DebuggerKernelScope, frameId: string | null): void {
    const selection = this.resolveSelectionState(scope);
    if (!frameId) {
      selection.selectedFrame = null;
      this.emitSelectionChanged(scope);
      return;
    }

    selection.selectedFrame = this.replay.listFrames(scope).find((frame) => frame.frameId === frameId) ?? null;
    this.emitSelectionChanged(scope);
  }

  selectNode(scope: DebuggerKernelScope, nodeId: string | null): void {
    this.inspector.selectNode(scope, nodeId);
    this.resolveSelectionState(scope).selectedNode = nodeId;
    this.emitSelectionChanged(scope);
  }

  selectVariable(scope: DebuggerKernelScope, variableKey: string | null): void {
    this.resolveSelectionState(scope).selectedVariable = variableKey;
    this.emitSelectionChanged(scope);
  }

  selectTimelineEvent(scope: DebuggerKernelScope, eventId: string | null): void {
    this.resolveSelectionState(scope).selectedTimelineEvent = eventId;
    this.emitSelectionChanged(scope);
  }

  selectExpression(scope: DebuggerKernelScope, expressionId: string | null): void {
    this.resolveSelectionState(scope).selectedExpression = expressionId;
    this.emitSelectionChanged(scope);
  }

  followLive(scope: DebuggerKernelScope): void {
    this.replay.followLive(scope);
    const currentFrame = this.replay.listFrames(scope).at(-1);
    if (currentFrame) {
      this.inspector.syncLiveNode(scope, currentFrame.snapshot, "live");
    }
    this.emitReplayPositionChanged(scope);
  }

  addBreakpoint(scope: DebuggerKernelScope, kind: DebuggerBreakpointKind): ReturnType<DebuggerBreakpointsSlotImpl["add"]> {
    const defaults = createDefaultBreakpoint(kind);
    const selectedNodeId = this.resolveSelectionState(scope).selectedNode;
    const payload = kind === "node" ? { ...defaults, nodeId: selectedNodeId } : defaults;
    return this.breakpoints.add(scope, payload);
  }

  removeBreakpoint(scope: DebuggerKernelScope, breakpointId: string) {
    return this.breakpoints.remove(scope, breakpointId);
  }

  toggleBreakpoint(scope: DebuggerKernelScope, breakpointId: string, enabled: boolean): void {
    this.breakpoints.toggle(scope, breakpointId, enabled);
  }

  addWatch(scope: DebuggerKernelScope, expression: string, label?: string | null) {
    return this.watches.add(scope, expression, label);
  }

  removeWatch(scope: DebuggerKernelScope, watchId: string): void {
    this.watches.remove(scope, watchId);
  }

  toggleWatch(scope: DebuggerKernelScope, watchId: string, enabled: boolean): void {
    this.watches.toggle(scope, watchId, enabled);
  }

  setExpressionDraft(scope: DebuggerKernelScope, expression: string | null): void {
    this.watches.setExpressionDraft(scope, expression);
    const snapshot = this.replay.getSelectedSnapshot(scope);
    if (snapshot && expression) {
      this.watches.processSnapshot(scope, snapshot, this.createEmitter(scope));
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

export type { DebuggerKernelSlots };
