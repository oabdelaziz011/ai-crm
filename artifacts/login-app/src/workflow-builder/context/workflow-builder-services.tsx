import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AutomationPlatformServices, ServiceContext } from "@workspace/automation-platform";
import { useAutomationPlatformServices } from "@/lib/automation-platform";
import { supabase } from "@/lib/supabase";
import { createSupabaseWorkflowRepository, type WorkflowRepository } from "@/workflow-builder/core/persistence/workflow-repository";

type WorkflowBuilderServices = {
  repository: WorkflowRepository;
  context: ServiceContext;
  automation: AutomationPlatformServices;
};

const WorkflowBuilderServicesContext = createContext<WorkflowBuilderServices | null>(null);

export function WorkflowBuilderServicesProvider({
  children,
  value: valueOverride,
}: {
  children: ReactNode;
  value?: WorkflowBuilderServices;
}) {
  const { services: automation, context: automationContext } = useAutomationPlatformServices();

  const value = useMemo<WorkflowBuilderServices>(
    () =>
      valueOverride ?? {
        repository: createSupabaseWorkflowRepository(supabase),
        context: automationContext,
        automation,
      },
    [automation, automationContext, valueOverride],
  );

  return <WorkflowBuilderServicesContext.Provider value={value}>{children}</WorkflowBuilderServicesContext.Provider>;
}

export function useWorkflowBuilderServices() {
  const value = useContext(WorkflowBuilderServicesContext);
  if (!value) throw new Error("useWorkflowBuilderServices must be used within WorkflowBuilderServicesProvider");
  return value;
}
