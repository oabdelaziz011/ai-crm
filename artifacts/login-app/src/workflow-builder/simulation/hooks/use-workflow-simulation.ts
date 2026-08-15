import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkflowDocument } from "../../core/types";
import { workflowSimulationKey } from "../cache/simulation-query-keys";
import { SimulationSessionRepository } from "../repositories/simulation-session-repository";
import { SimulationService } from "../services/simulation-service";
import type { SimulationSnapshot, SimulationStartOptions } from "../types/simulation-types";
import {
  computeWorkflowDocumentFingerprint,
  hasWorkflowDocumentDrift,
} from "../utilities/simulation-document-fingerprint";
import { createIdleSimulationSnapshot } from "../utilities/simulation-snapshot-utils";

const ACTIVE_SIMULATION_STATUSES = new Set<SimulationSnapshot["status"]>([
  "running",
  "paused",
  "waiting_input",
]);

export function invalidateSimulationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string | null,
  flowId: string | null,
) {
  queryClient.invalidateQueries({ queryKey: workflowSimulationKey(companyId, flowId) });
}

type UseWorkflowSimulationOptions = {
  enabled?: boolean;
};

export function useWorkflowSimulation(document: WorkflowDocument, options: UseWorkflowSimulationOptions = {}) {
  const queryClient = useQueryClient();
  const flowId = document.flowId;
  const companyId = document.companyId;
  const canRun = options.enabled !== false && Boolean(flowId && companyId);
  const queryKey = useMemo(() => workflowSimulationKey(companyId, flowId), [companyId, flowId]);
  const service = useMemo(
    () => new SimulationService(new SimulationSessionRepository()),
    [],
  );
  const idleSnapshot = useMemo(
    () => createIdleSimulationSnapshot(companyId, flowId),
    [companyId, flowId],
  );
  const [panelOpen, setPanelOpen] = useState(false);
  const [documentDrift, setDocumentDrift] = useState(false);
  const driftPauseRequestedRef = useRef(false);
  const documentFingerprint = useMemo(() => computeWorkflowDocumentFingerprint(document), [document]);
  const sessionDocumentFingerprint = canRun ? service.getSessionDocumentFingerprint(companyId, flowId) : null;

  useEffect(() => {
    if (!canRun || !companyId || !flowId) return;
    return () => {
      service.disposeScope(companyId, flowId);
    };
  }, [canRun, companyId, flowId, service]);

  const snapshotQuery = useQuery({
    queryKey,
    queryFn: () => service.getSnapshot(companyId, flowId),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    enabled: canRun,
    initialData: idleSnapshot,
    structuralSharing: true,
  });

  const snapshot = useMemo(() => {
    if (!canRun) return idleSnapshot;
    return snapshotQuery.data ?? idleSnapshot;
  }, [canRun, idleSnapshot, snapshotQuery.data]);

  const pendingBreakpoints = useMemo(
    () =>
      canRun && snapshot.status === "idle"
        ? service.getPendingBreakpoints(companyId, flowId)
        : snapshot.breakpoints,
    [canRun, companyId, flowId, service, snapshot.breakpoints, snapshot.status],
  );

  const commitSnapshot = useCallback(
    (next: Readonly<SimulationSnapshot>) => {
      if (!canRun) return next;
      const current = queryClient.getQueryData<Readonly<SimulationSnapshot>>(queryKey);
      if (current === next) return next;
      queryClient.setQueryData(queryKey, next);
      return next;
    },
    [canRun, queryClient, queryKey],
  );

  useEffect(() => {
    if (!canRun) {
      setDocumentDrift(false);
      driftPauseRequestedRef.current = false;
      return;
    }

    if (!ACTIVE_SIMULATION_STATUSES.has(snapshot.status)) {
      setDocumentDrift(false);
      driftPauseRequestedRef.current = false;
      return;
    }

    if (!hasWorkflowDocumentDrift(sessionDocumentFingerprint, document)) {
      return;
    }

    setDocumentDrift(true);

    if (snapshot.status === "running" && !driftPauseRequestedRef.current) {
      driftPauseRequestedRef.current = true;
      commitSnapshot(service.pauseForDocumentDrift(companyId, flowId));
    }
  }, [
    canRun,
    commitSnapshot,
    companyId,
    document,
    flowId,
    service,
    sessionDocumentFingerprint,
    snapshot.status,
  ]);

  const runCooperative = useCallback(
    async (
      runner: (onProgress: (snapshot: Readonly<SimulationSnapshot>) => void) => Promise<Readonly<SimulationSnapshot>>,
    ) => {
      if (!canRun) return idleSnapshot;
      const onProgress = (next: Readonly<SimulationSnapshot>) => {
        commitSnapshot(next);
      };
      const finalSnapshot = await runner(onProgress);
      return commitSnapshot(finalSnapshot);
    },
    [canRun, commitSnapshot, idleSnapshot],
  );

  const start = useCallback(
    async (startOptions: SimulationStartOptions = {}) => {
      if (!canRun) return idleSnapshot;
      setDocumentDrift(false);
      driftPauseRequestedRef.current = false;
      setPanelOpen(true);

      if (startOptions.autoAdvance === false) {
        const next = service.start(document, {
          ...startOptions,
          breakpoints: startOptions.breakpoints ?? pendingBreakpoints,
        });
        return commitSnapshot(next);
      }

      return runCooperative((onProgress) =>
        service.startCooperative(document, {
          ...startOptions,
          breakpoints: startOptions.breakpoints ?? pendingBreakpoints,
          onProgress,
        }),
      );
    },
    [canRun, commitSnapshot, document, idleSnapshot, pendingBreakpoints, runCooperative, service],
  );

  const pause = useCallback(() => {
    if (!canRun) return idleSnapshot;
    return commitSnapshot(service.pause(companyId, flowId));
  }, [canRun, commitSnapshot, companyId, flowId, idleSnapshot, service]);

  const resume = useCallback(async () => {
    if (!canRun || documentDrift) return idleSnapshot;
    return runCooperative((onProgress) => service.resumeCooperative(companyId, flowId, { onProgress }));
  }, [canRun, companyId, documentDrift, flowId, idleSnapshot, runCooperative, service]);

  const restart = useCallback(
    async (restartOptions: SimulationStartOptions = {}) => {
      if (!canRun) return idleSnapshot;
      setDocumentDrift(false);
      driftPauseRequestedRef.current = false;

      if (restartOptions.autoAdvance === false) {
        return commitSnapshot(
          service.restart(companyId, flowId, document, {
            ...restartOptions,
            breakpoints: restartOptions.breakpoints ?? pendingBreakpoints,
          }),
        );
      }

      return runCooperative((onProgress) =>
        service.restartCooperative(companyId, flowId, document, {
          ...restartOptions,
          breakpoints: restartOptions.breakpoints ?? pendingBreakpoints,
          onProgress,
        }),
      );
    },
    [canRun, commitSnapshot, companyId, document, flowId, idleSnapshot, pendingBreakpoints, runCooperative, service],
  );

  const stop = useCallback(() => {
    if (!canRun) return idleSnapshot;
    setDocumentDrift(false);
    driftPauseRequestedRef.current = false;
    return commitSnapshot(service.stop(companyId, flowId));
  }, [canRun, commitSnapshot, companyId, flowId, idleSnapshot, service]);

  const step = useCallback(() => {
    if (!canRun || documentDrift) return idleSnapshot;
    return commitSnapshot(service.step(companyId, flowId));
  }, [canRun, commitSnapshot, companyId, documentDrift, flowId, idleSnapshot, service]);

  const toggleBreakpoint = useCallback(
    (nodeId: string) => {
      if (!canRun) return idleSnapshot;
      return commitSnapshot(service.toggleBreakpoint(companyId, flowId, nodeId));
    },
    [canRun, commitSnapshot, companyId, flowId, idleSnapshot, service],
  );

  return useMemo(
    () => ({
      enabled: canRun,
      snapshot,
      panelOpen,
      setPanelOpen,
      breakpoints: pendingBreakpoints,
      documentDrift,
      start,
      pause,
      resume,
      restart,
      stop,
      step,
      toggleBreakpoint,
      refresh: () => (canRun ? invalidateSimulationQueries(queryClient, companyId, flowId) : undefined),
      isActive: canRun && snapshot.status !== "idle" && snapshot.status !== "stopped",
      isLoading: canRun && snapshotQuery.isLoading,
    }),
    [
      canRun,
      snapshot,
      panelOpen,
      pendingBreakpoints,
      documentDrift,
      start,
      pause,
      resume,
      restart,
      stop,
      step,
      toggleBreakpoint,
      queryClient,
      companyId,
      flowId,
      snapshotQuery.isLoading,
    ],
  );
}

export type WorkflowSimulationController = ReturnType<typeof useWorkflowSimulation>;
