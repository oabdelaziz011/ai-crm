import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ValidationIssue, WorkflowDocument } from "../../core/types";
import type { WorkflowAnalyticsController } from "../../analytics/hooks/use-workflow-analytics";
import { createEmptyAnalyticsViewModel } from "../../analytics/utilities/empty-analytics-view-model";
import { workflowOptimizationKey } from "../cache/optimization-query-keys";
import { createWorkflowOptimizationDataProvider } from "../providers/workflow-optimization-data-providers";
import { buildWorkflowOptimizationViewModelFromProvider } from "../services/optimization-service";
import { createEmptyOptimizationViewModel } from "../utilities/empty-optimization-view-model";

type UseWorkflowOptimizationOptions = {
  enabled?: boolean;
};

type WorkflowOptimizationSources = {
  analytics: WorkflowAnalyticsController | null;
  validationIssues: readonly ValidationIssue[];
};

export function invalidateOptimizationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string | null,
  flowId: string | null,
) {
  queryClient.invalidateQueries({ queryKey: workflowOptimizationKey(companyId, flowId) });
}

export function useWorkflowOptimization(
  document: WorkflowDocument,
  sources: WorkflowOptimizationSources,
  options: UseWorkflowOptimizationOptions = {},
) {
  const queryClient = useQueryClient();
  const companyId = document.companyId;
  const flowId = document.flowId;
  const canRun = options.enabled !== false && Boolean(companyId && flowId);
  const queryKey = useMemo(() => workflowOptimizationKey(companyId, flowId), [companyId, flowId]);
  const [panelOpen, setPanelOpen] = useState(false);

  const dataProvider = useMemo(
    () =>
      createWorkflowOptimizationDataProvider({
        document,
        readAnalytics: () => ({
          analytics: sources.analytics?.viewModel ?? createEmptyAnalyticsViewModel(),
        }),
        readValidation: () => ({
          validationIssues: sources.validationIssues,
        }),
      }),
    [document, sources.analytics?.viewModel, sources.validationIssues],
  );

  const optimizationQuery = useQuery({
    queryKey,
    queryFn: () => buildWorkflowOptimizationViewModelFromProvider(dataProvider),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    enabled: canRun,
    initialData: createEmptyOptimizationViewModel(),
  });

  useEffect(() => {
    if (!canRun) return;
    queryClient.setQueryData(queryKey, buildWorkflowOptimizationViewModelFromProvider(dataProvider));
  }, [canRun, dataProvider, queryClient, queryKey]);

  const viewModel = optimizationQuery.data ?? createEmptyOptimizationViewModel();

  const refresh = useCallback(() => {
    if (!canRun) return;
    queryClient.setQueryData(queryKey, buildWorkflowOptimizationViewModelFromProvider(dataProvider));
  }, [canRun, dataProvider, queryClient, queryKey]);

  return {
    enabled: canRun,
    panelOpen,
    setPanelOpen,
    viewModel,
    refresh,
  };
}

export type WorkflowOptimizationController = ReturnType<typeof useWorkflowOptimization>;
