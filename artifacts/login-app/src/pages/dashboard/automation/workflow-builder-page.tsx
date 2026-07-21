import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { NEST_INDEX } from "@/lib/routing";
import type { WorkflowDocument } from "@/workflow-builder/core/types";
import { WorkflowBuilderShell } from "@/workflow-builder/components/workflow-builder-shell";
import { useWorkflowBuilderServices } from "@/workflow-builder/context/workflow-builder-services";

/** Survives page remounts when nested route params resolve one frame late. */
let persistedBuilderFlowId: string | null = null;

function workflowQueryKey(flowId: string) {
  return ["automation-workflow", flowId] as const;
}

export function WorkflowBuilderPage() {
  const [, params] = useRoute("/:flowId");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { repository } = useWorkflowBuilderServices();
  const lastDocumentRef = useRef<WorkflowDocument | null>(null);

  const routeFlowId = params?.flowId ?? "";
  if (routeFlowId) {
    persistedBuilderFlowId = routeFlowId;
  }
  const flowId = routeFlowId || persistedBuilderFlowId || "";

  const workflowQuery = useQuery({
    queryKey: workflowQueryKey(flowId),
    enabled: Boolean(flowId),
    queryFn: async () => repository.load(flowId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    placeholderData: () =>
      flowId ? queryClient.getQueryData<WorkflowDocument>(workflowQueryKey(flowId)) : undefined,
  });

  useEffect(() => {
    if (workflowQuery.isError) setLocation(NEST_INDEX);
  }, [workflowQuery.isError, setLocation]);

  const cachedDocument = flowId
    ? queryClient.getQueryData<WorkflowDocument>(workflowQueryKey(flowId))
    : undefined;
  const document = workflowQuery.data ?? cachedDocument ?? lastDocumentRef.current ?? undefined;

  if (document) {
    lastDocumentRef.current = document;
  }

  if (!document && (!flowId || workflowQuery.isLoading)) {
    return <DashboardPageFallback />;
  }

  if (!document) {
    return <DashboardPageFallback />;
  }

  return (
    <WorkflowBuilderShell
      key={document.flowId}
      document={document}
      onBack={() => setLocation(NEST_INDEX)}
    />
  );
}
