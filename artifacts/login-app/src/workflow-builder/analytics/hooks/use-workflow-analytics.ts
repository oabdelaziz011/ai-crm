import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkflowDocument } from "../../core/types";
import type { WorkflowDebuggerController } from "../../debugger/hooks/use-workflow-debugger";
import type { WorkflowSimulationController } from "../../simulation/hooks/use-workflow-simulation";
import type { WorkflowTestingController } from "../../testing/hooks/use-workflow-testing";
import type { WorkflowTriggerConfigurationController } from "../../triggers/hooks/use-workflow-trigger-configuration";
import { workflowAnalyticsKey } from "../cache/analytics-query-keys";
import { createWorkflowAnalyticsDataProvider } from "../providers/workflow-analytics-data-providers";
import { buildWorkflowAnalyticsViewModelFromProvider } from "../services/analytics-service";
import { createEmptyAnalyticsViewModel } from "../utilities/empty-analytics-view-model";

type UseWorkflowAnalyticsOptions = {
  enabled?: boolean;
};

type WorkflowAnalyticsSources = {
  testing: WorkflowTestingController | null;
  simulation: WorkflowSimulationController | null;
  debugger: WorkflowDebuggerController | null;
  trigger: WorkflowTriggerConfigurationController | null;
};

export function invalidateAnalyticsQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string | null,
  flowId: string | null,
) {
  queryClient.invalidateQueries({ queryKey: workflowAnalyticsKey(companyId, flowId) });
}

export function useWorkflowAnalytics(
  document: WorkflowDocument,
  sources: WorkflowAnalyticsSources,
  options: UseWorkflowAnalyticsOptions = {},
) {
  const queryClient = useQueryClient();
  const companyId = document.companyId;
  const flowId = document.flowId;
  const canRun = options.enabled !== false && Boolean(companyId && flowId);
  const queryKey = useMemo(() => workflowAnalyticsKey(companyId, flowId), [companyId, flowId]);
  const [panelOpen, setPanelOpen] = useState(false);

  const dataProvider = useMemo(
    () =>
      createWorkflowAnalyticsDataProvider({
        document,
        readSimulation: () => ({
          simulationReport: sources.simulation?.snapshot.report ?? null,
        }),
        readTesting: () => ({
          runHistory: sources.testing?.viewModel.runHistory ?? [],
          latestRun: sources.testing?.viewModel.latestRun ?? null,
        }),
        readDebugger: () => ({
          profilerEntries: sources.debugger?.viewModel.advanced.profiler ?? [],
          hotPaths: sources.debugger?.viewModel.advanced.hotPaths ?? [],
        }),
        readTrigger: () => ({
          triggerAnalytics: sources.trigger?.analytics ?? null,
        }),
      }),
    [
      document,
      sources.debugger?.viewModel.advanced.hotPaths,
      sources.debugger?.viewModel.advanced.profiler,
      sources.simulation?.snapshot.report,
      sources.testing?.viewModel.latestRun,
      sources.testing?.viewModel.runHistory,
      sources.trigger?.analytics,
    ],
  );

  const analyticsQuery = useQuery({
    queryKey,
    queryFn: () => buildWorkflowAnalyticsViewModelFromProvider(dataProvider),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    enabled: canRun,
    initialData: createEmptyAnalyticsViewModel(),
  });

  useEffect(() => {
    if (!canRun) return;
    queryClient.setQueryData(queryKey, buildWorkflowAnalyticsViewModelFromProvider(dataProvider));
  }, [canRun, dataProvider, queryClient, queryKey]);

  const viewModel = analyticsQuery.data ?? createEmptyAnalyticsViewModel();

  const refresh = useCallback(() => {
    if (!canRun) return;
    queryClient.setQueryData(queryKey, buildWorkflowAnalyticsViewModelFromProvider(dataProvider));
  }, [canRun, dataProvider, queryClient, queryKey]);

  return {
    enabled: canRun,
    panelOpen,
    setPanelOpen,
    viewModel,
    refresh,
    analyticsLoading: sources.trigger?.analyticsLoading ?? false,
  };
}

export type WorkflowAnalyticsController = ReturnType<typeof useWorkflowAnalytics>;
