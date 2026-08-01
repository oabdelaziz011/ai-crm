import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-rbac";
import type { WorkflowDocument } from "../../core/types";
import { useBuilderActions } from "../../context/workflow-builder-context";
import {
  workflowTriggerAnalyticsKey,
  workflowTriggerBindingsKey,
} from "../cache/trigger-query-keys";
import {
  hasWorkflowTriggerEditPermission,
  hasWorkflowTriggerTestPermission,
  hasWorkflowTriggerViewPermission,
} from "../permissions/workflow-trigger-access";
import { TriggerAnalyticsRepository } from "../repositories/trigger-analytics-repository";
import { TriggerBindingRepository } from "../repositories/trigger-binding-repository";
import {
  TriggerConfigurationService,
} from "../services/trigger-configuration-service";
import type { TriggerCatalogId, TriggerConfiguration } from "../types/trigger-types";
import {
  mergeTriggerConfigPatch,
  withTriggerConfigExtension,
} from "../utilities/trigger-config-utils";

type UseWorkflowTriggerConfigurationOptions = {
  enabled?: boolean;
};

export function useWorkflowTriggerConfiguration(
  document: WorkflowDocument,
  options: UseWorkflowTriggerConfigurationOptions = {},
) {
  const { hasPermission, isSuperAdmin } = usePermissions();
  const { setMetadata } = useBuilderActions();
  const canView = hasWorkflowTriggerViewPermission(hasPermission, isSuperAdmin);
  const canEdit = hasWorkflowTriggerEditPermission(hasPermission, isSuperAdmin);
  const canTest = hasWorkflowTriggerTestPermission(hasPermission, isSuperAdmin);
  const enabled = options.enabled !== false && canView && Boolean(document.flowId && document.companyId);

  const service = useMemo(() => new TriggerConfigurationService(), []);
  const analyticsRepository = useMemo(() => new TriggerAnalyticsRepository(supabase), []);
  const bindingRepository = useMemo(() => new TriggerBindingRepository(supabase), []);

  const configuration = useMemo(() => service.resolveConfiguration(document), [document, service]);

  const bindingsQuery = useQuery({
    queryKey: workflowTriggerBindingsKey(document.companyId, document.flowId),
    queryFn: () => bindingRepository.listBindingsForFlow(document.companyId, document.flowId),
    enabled,
    staleTime: 60_000,
  });

  const analyticsQuery = useQuery({
    queryKey: workflowTriggerAnalyticsKey(document.companyId, document.flowId),
    queryFn: () => analyticsRepository.loadAnalytics(document.companyId, document.flowId),
    enabled,
    staleTime: 60_000,
  });

  const bindings = bindingsQuery.data ?? [];

  const preview = useMemo(() => service.preview(document), [document, service]);
  const validationIssues = useMemo(
    () => service.validateWorkflow(document, bindings),
    [bindings, document, service],
  );
  const readiness = useMemo(
    () =>
      service.readiness(
        document,
        bindings,
        canEdit,
        canTest,
        analyticsQuery.data,
      ),
    [analyticsQuery.data, bindings, canEdit, canTest, document, service],
  );
  const testPayload = useMemo(() => service.testPayload(document), [document, service]);

  const selectCatalogTrigger = useCallback(
    (catalogId: TriggerCatalogId) => {
      if (!canEdit || document.readOnly) return;
      const selection = service.applyCatalogSelection(catalogId);
      setMetadata({
        triggerType: selection.triggerType,
        extensions: withTriggerConfigExtension(document, selection.triggerConfig).extensions,
      });
    },
    [canEdit, document, service, setMetadata],
  );

  const updateTriggerConfig = useCallback(
    (patch: Partial<TriggerConfiguration>) => {
      if (!canEdit || document.readOnly) return;
      const nextConfig = mergeTriggerConfigPatch(configuration, patch);
      setMetadata({
        extensions: withTriggerConfigExtension(document, nextConfig).extensions,
      });
    },
    [canEdit, configuration, document, setMetadata],
  );

  return {
    enabled,
    canView,
    canEdit,
    canTest,
    configuration,
    preview,
    validationIssues,
    readiness,
    testPayload,
    analytics: analyticsQuery.data,
    bindings,
    bindingsLoading: bindingsQuery.isLoading,
    analyticsLoading: analyticsQuery.isLoading,
    selectCatalogTrigger,
    updateTriggerConfig,
  };
}

export type WorkflowTriggerConfigurationController = ReturnType<typeof useWorkflowTriggerConfiguration>;
