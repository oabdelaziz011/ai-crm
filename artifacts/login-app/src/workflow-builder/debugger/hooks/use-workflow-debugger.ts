import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WorkflowDocument } from "../../core/types";
import type { WorkflowSimulationController } from "../../simulation/hooks/use-workflow-simulation";
import { createIdleSimulationSnapshot } from "../../simulation/utilities/simulation-snapshot-utils";
import { workflowDebuggerKey } from "../cache/debugger-query-keys";
import { InMemoryDebuggerReplayRepository } from "../repositories/in-memory-debugger-replay-repository";
import { mapReplayHistoryToActivityEvents, mapSelectedSnapshotToActivityEvents } from "../selectors/debug-timeline-adapter";
import { buildReplayViewModel, resolveDisplayedSnapshot } from "../selectors/replay-selectors";
import { DebuggerKernel } from "../services/debugger-kernel";
import { createDefaultDebugSelectionState, type ReplayViewModel } from "../types/debugger-types";

type UseWorkflowDebuggerOptions = {
  enabled?: boolean;
};

type DebuggerViewModel = ReplayViewModel & {
  timelineEvents: ReturnType<typeof mapReplayHistoryToActivityEvents>;
  displayedSnapshot: ReturnType<typeof resolveDisplayedSnapshot>;
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

  const bump = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  const scope = useMemo(() => ({ companyId, flowId }), [companyId, flowId]);

  useEffect(() => {
    if (!enabled || !simulation) return;

    const sessionId = simulation.snapshot.sessionId;
    if (sessionId !== lastSessionIdRef.current) {
      if (lastSessionIdRef.current !== null) {
        kernel.reset(scope);
      }
      lastSessionIdRef.current = sessionId;
    }

    kernel.observeSnapshot(scope, simulation.snapshot, document);
    bump();
  }, [bump, document, enabled, kernel, scope, simulation, simulation?.snapshot]);

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
    if (!enabled) return;
    kernel.reset(scope);
    bump();
  }, [bump, enabled, kernel, scope]);

  const followLive = useCallback(() => {
    if (!enabled) return;
    kernel.followLive(scope);
    bump();
  }, [bump, enabled, kernel, scope]);

  const selectFrame = useCallback(
    (frameId: string | null) => {
      if (!enabled) return;
      kernel.selectFrame(scope, frameId);
      bump();
    },
    [bump, enabled, kernel, scope],
  );

  const selectNode = useCallback(
    (nodeId: string | null) => {
      if (!enabled) return;
      kernel.selectNode(scope, nodeId);
      bump();
    },
    [bump, enabled, kernel, scope],
  );

  const selectVariable = useCallback(
    (variableKey: string | null) => {
      if (!enabled) return;
      kernel.selectVariable(scope, variableKey);
      bump();
    },
    [bump, enabled, kernel, scope],
  );

  const selectTimelineEvent = useCallback(
    (eventId: string | null) => {
      if (!enabled) return;
      kernel.selectTimelineEvent(scope, eventId);
      bump();
    },
    [bump, enabled, kernel, scope],
  );

  const selectExpression = useCallback(
    (expressionId: string | null) => {
      if (!enabled) return;
      kernel.selectExpression(scope, expressionId);
      bump();
    },
    [bump, enabled, kernel, scope],
  );

  return {
    enabled,
    kernel,
    repository,
    selection: enabled ? kernel.getSelectionState(scope) : createDefaultDebugSelectionState(),
    viewModel,
    stepBack,
    stepForward,
    jumpTo,
    resetReplay,
    followLive,
    selectFrame,
    selectNode,
    selectVariable,
    selectTimelineEvent,
    selectExpression,
  };
}

export type WorkflowDebuggerController = ReturnType<typeof useWorkflowDebugger>;
