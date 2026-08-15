import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WorkflowDocument } from "../../core/types";
import type { WorkflowSimulationController } from "../../simulation/hooks/use-workflow-simulation";
import { createIdleSimulationSnapshot } from "../../simulation/utilities/simulation-snapshot-utils";
import { workflowDebuggerKey } from "../cache/debugger-query-keys";
import { InMemoryDebuggerReplayRepository } from "../repositories/in-memory-debugger-replay-repository";
import { mapReplayHistoryToActivityEvents, mapSelectedSnapshotToActivityEvents } from "../selectors/debug-timeline-adapter";
import { buildReplayViewModel, resolveDisplayedSnapshot } from "../selectors/replay-selectors";
import { buildDebuggerAdvancedViewModel } from "../selectors/debugger-advanced-selectors";
import { DebuggerKernel } from "../services/debugger-kernel";
import { createDefaultDebugSelectionState, type ReplayViewModel } from "../types/debugger-types";
import type { DebuggerAdvancedViewModel } from "../types/debugger-advanced-types";
import type { DebuggerBreakpointKind } from "../types/debugger-kernel-types";
import { isDebuggerEventType } from "../types/debugger-event-types";

type UseWorkflowDebuggerOptions = {
  enabled?: boolean;
};

type DebuggerViewModel = ReplayViewModel & {
  timelineEvents: ReturnType<typeof mapReplayHistoryToActivityEvents>;
  displayedSnapshot: ReturnType<typeof resolveDisplayedSnapshot>;
  frameSnapshots: ReadonlyArray<Readonly<import("../types/debugger-types").DebugFrame>["snapshot"]>;
  advanced: DebuggerAdvancedViewModel;
};

export function useWorkflowDebugger(
  document: WorkflowDocument,
  simulation: WorkflowSimulationController | null,
  options: UseWorkflowDebuggerOptions = {},
) {
  const queryClient = useQueryClient();
  const companyId = document.companyId;
  const flowId = document.flowId;
  const enabled = options.enabled !== false && Boolean(simulation?.enabled && companyId && flowId);
  const queryKey = useMemo(() => workflowDebuggerKey(companyId, flowId), [companyId, flowId]);

  const repository = useMemo(() => new InMemoryDebuggerReplayRepository(), []);
  const kernel = useMemo(() => new DebuggerKernel(repository), [repository]);
  const [revision, setRevision] = useState(0);
  const lastSessionIdRef = useRef<string | null>(null);
  const pausedBreakpointRef = useRef<string | null>(null);

  const bump = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  const scope = useMemo(() => ({ companyId, flowId }), [companyId, flowId]);
  const snapshot = simulation?.snapshot;
  const documentRef = useRef(document);
  documentRef.current = document;
  const simulationRef = useRef(simulation);
  simulationRef.current = simulation;

  useEffect(() => {
    if (!enabled || !snapshot) return;

    const sessionId = snapshot.sessionId;
    let sessionChanged = false;
    if (sessionId !== lastSessionIdRef.current) {
      if (lastSessionIdRef.current !== null) {
        kernel.reset(scope);
      }
      lastSessionIdRef.current = sessionId;
      sessionChanged = true;
    }

    const countBefore = kernel.getReplayState(scope).count;
    kernel.observeSnapshot(scope, snapshot, documentRef.current);
    const countAfter = kernel.getReplayState(scope).count;

    // Do not depend on the simulation controller object — it is a new literal every
    // parent render. Always bumping here caused Maximum update depth crashes on canvas move.
    if (sessionChanged || countAfter !== countBefore) {
      bump();
    }
  }, [bump, enabled, kernel, scope, snapshot]);

  useEffect(() => {
    if (!enabled || !simulation) return;

    return kernel.subscribe(scope, (event) => {
      const live = simulationRef.current;
      if (!live) return;
      if (!isDebuggerEventType(event, "BreakpointHit") || !event.payload.live) return;
      if (live.snapshot.status !== "running") {
        pausedBreakpointRef.current = null;
        return;
      }
      const breakpointId = event.payload.hit.breakpointId;
      if (pausedBreakpointRef.current === breakpointId) return;
      pausedBreakpointRef.current = breakpointId;
      live.pause();
    });
  }, [enabled, kernel, scope, simulation?.enabled]);

  useEffect(() => {
    if (!enabled) return;
    return () => {
      kernel.disposeScope(scope);
    };
  }, [enabled, kernel, scope]);

  const viewModel = useMemo<DebuggerViewModel>(() => {
    if (!enabled || !simulation) {
      const idleSnapshot = createIdleSimulationSnapshot(companyId, flowId);
      return {
        replay: { capacity: 0, count: 0, index: -1, canStepBack: false, canStepForward: false, mode: "live" as const },
        inspector: {
          selectedNodeId: null,
          selectedFrameIndex: -1,
          currentNodeId: null,
          previousNodeId: null,
          nextNodeId: null,
          workflowState: "idle" as const,
        },
        selection: createDefaultDebugSelectionState(),
        selectedSnapshot: null,
        frames: [],
        timelineEvents: [],
        displayedSnapshot: idleSnapshot,
        frameSnapshots: [],
        advanced: buildDebuggerAdvancedViewModel({
          kernel,
          scope,
          document,
          displayedSnapshot: idleSnapshot,
          frames: [],
        }),
      };
    }

    const liveSnapshot = simulation.snapshot;
    const replay = kernel.getReplayState(scope);
    const replaySnapshot = kernel.getSelectedSnapshot(scope);
    const inspector = kernel.getInspectorState(scope, liveSnapshot);
    const frames = kernel.listFrames(scope);
    const snapshots = frames.map((frame) => frame.snapshot);
    const selectedSnapshot = resolveDisplayedSnapshot({
      liveSnapshot,
      replaySnapshot,
      mode: replay.mode,
    });
    const replayViewModel = buildReplayViewModel({
      replay,
      inspector,
      selection: kernel.getSelectionState(scope),
      selectedSnapshot: replay.mode === "replay" ? replaySnapshot : liveSnapshot,
      frames,
    });

    return {
      ...replayViewModel,
      displayedSnapshot: selectedSnapshot,
      frameSnapshots: frames.map((frame) => frame.snapshot),
      advanced: buildDebuggerAdvancedViewModel({
        kernel,
        scope,
        document,
        displayedSnapshot: selectedSnapshot,
        frames,
      }),
      timelineEvents:
        replay.mode === "replay" && replaySnapshot
          ? mapSelectedSnapshotToActivityEvents({
              snapshot: replaySnapshot,
              companyId,
              flowId,
              frameIndex: replay.index,
            })
          : mapReplayHistoryToActivityEvents({
              snapshots,
              companyId,
              flowId,
              selectedFrameIndex: replay.index,
            }),
    };
  }, [companyId, document, enabled, flowId, kernel, revision, scope, simulation]);

  useEffect(() => {
    if (!enabled) return;
    queryClient.setQueryData(queryKey, viewModel);
  }, [enabled, queryClient, queryKey, viewModel]);

  const runKernelAction = useCallback(
    (action: () => void) => {
      if (!enabled) return;
      action();
      bump();
    },
    [bump, enabled],
  );

  const stepBack = useCallback(() => {
    if (!enabled) return false;
    const moved = kernel.stepBack(scope);
    if (moved) bump();
    return moved;
  }, [bump, enabled, kernel, scope]);

  const stepForward = useCallback(() => {
    if (!enabled) return false;
    const moved = kernel.stepForward(scope);
    if (moved) bump();
    return moved;
  }, [bump, enabled, kernel, scope]);

  const jumpTo = useCallback(
    (index: number) => {
      if (!enabled) return false;
      const moved = kernel.jump(scope, index);
      if (moved) bump();
      return moved;
    },
    [bump, enabled, kernel, scope],
  );

  const resetReplay = useCallback(() => {
    runKernelAction(() => kernel.reset(scope));
  }, [kernel, runKernelAction, scope]);

  const followLive = useCallback(() => {
    runKernelAction(() => kernel.followLive(scope));
  }, [kernel, runKernelAction, scope]);

  const stepFirst = useCallback(() => {
    if (!enabled) return false;
    const state = kernel.getReplayState(scope);
    if (state.count === 0) return false;
    const moved = kernel.jump(scope, 0);
    if (moved) bump();
    return moved;
  }, [bump, enabled, kernel, scope]);

  const stepLast = useCallback(() => {
    if (!enabled) return false;
    const state = kernel.getReplayState(scope);
    if (state.count === 0) return false;
    const moved = kernel.jump(scope, state.count - 1);
    if (moved) bump();
    return moved;
  }, [bump, enabled, kernel, scope]);

  const selectFrame = useCallback(
    (frameId: string | null) => {
      runKernelAction(() => kernel.selectFrame(scope, frameId));
    },
    [kernel, runKernelAction, scope],
  );

  const selectNode = useCallback(
    (nodeId: string | null) => {
      runKernelAction(() => kernel.selectNode(scope, nodeId));
    },
    [kernel, runKernelAction, scope],
  );

  const selectVariable = useCallback(
    (variableKey: string | null) => {
      runKernelAction(() => kernel.selectVariable(scope, variableKey));
    },
    [kernel, runKernelAction, scope],
  );

  const selectTimelineEvent = useCallback(
    (eventId: string | null) => {
      runKernelAction(() => kernel.selectTimelineEvent(scope, eventId));
    },
    [kernel, runKernelAction, scope],
  );

  const selectExpression = useCallback(
    (expressionId: string | null) => {
      runKernelAction(() => kernel.selectExpression(scope, expressionId));
    },
    [kernel, runKernelAction, scope],
  );

  const readReplayIndex = useCallback(() => {
    if (!enabled) return -1;
    return kernel.getReplayState(scope).index;
  }, [enabled, kernel, scope]);

  const syncSimulationNodeBreakpoint = useCallback(
    (nodeId: string | null | undefined) => {
      if (nodeId && simulation) {
        simulation.toggleBreakpoint(nodeId);
      }
    },
    [simulation],
  );

  const addBreakpoint = useCallback(
    (kind: DebuggerBreakpointKind) => {
      if (!enabled) return null;
      const created = kernel.addBreakpoint(scope, kind);
      if (kind === "node") {
        syncSimulationNodeBreakpoint(created.nodeId);
      }
      bump();
      return created;
    },
    [bump, enabled, kernel, scope, syncSimulationNodeBreakpoint],
  );

  const removeBreakpoint = useCallback(
    (breakpointId: string) => {
      if (!enabled) return;
      const removed = kernel.removeBreakpoint(scope, breakpointId);
      if (removed?.kind === "node") {
        syncSimulationNodeBreakpoint(removed.nodeId);
      }
      bump();
    },
    [bump, enabled, kernel, scope, syncSimulationNodeBreakpoint],
  );

  const toggleBreakpoint = useCallback(
    (breakpointId: string, isEnabled: boolean) => {
      runKernelAction(() => kernel.toggleBreakpoint(scope, breakpointId, isEnabled));
    },
    [kernel, runKernelAction, scope],
  );

  const addWatch = useCallback(
    (expression: string, label?: string | null) => {
      if (!enabled) return null;
      const created = kernel.addWatch(scope, expression, label);
      const snapshot = kernel.getSelectedSnapshot(scope) ?? simulation?.snapshot;
      if (snapshot) {
        kernel.observeSnapshot(scope, snapshot, document);
      }
      bump();
      return created;
    },
    [bump, document, enabled, kernel, scope, simulation?.snapshot],
  );

  const removeWatch = useCallback(
    (watchId: string) => {
      runKernelAction(() => kernel.removeWatch(scope, watchId));
    },
    [kernel, runKernelAction, scope],
  );

  const toggleWatch = useCallback(
    (watchId: string, isEnabled: boolean) => {
      runKernelAction(() => kernel.toggleWatch(scope, watchId, isEnabled));
    },
    [kernel, runKernelAction, scope],
  );

  const setExpressionDraft = useCallback(
    (expression: string | null) => {
      runKernelAction(() => kernel.setExpressionDraft(scope, expression));
    },
    [kernel, runKernelAction, scope],
  );

  return {
    enabled,
    kernel,
    repository,
    selection: enabled ? kernel.getSelectionState(scope) : createDefaultDebugSelectionState(),
    viewModel,
    readReplayIndex,
    stepBack,
    stepForward,
    jumpTo,
    resetReplay,
    followLive,
    stepFirst,
    stepLast,
    selectFrame,
    selectNode,
    selectVariable,
    selectTimelineEvent,
    selectExpression,
    addBreakpoint,
    removeBreakpoint,
    toggleBreakpoint,
    addWatch,
    removeWatch,
    toggleWatch,
    setExpressionDraft,
  };
}

export type WorkflowDebuggerController = ReturnType<typeof useWorkflowDebugger>;
