import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  automationExecutionHistoryKey,
  automationHistoryKey,
  automationTemplatesKey,
  automationWorkflowKey,
  automationWorkflowsKey,
  getAutomationServices,
  getWorkflowTemplate,
} from "@/lib/automation";
import type { AutomationWorkflowInput } from "@/lib/automation/types";

export function useAutomationWorkflows(companyId: string | null) {
  const { repository } = getAutomationServices();

  return useQuery({
    queryKey: automationWorkflowsKey(companyId),
    enabled: Boolean(companyId),
    queryFn: () => repository.list(companyId!),
  });
}

export function useAutomationWorkflow(companyId: string | null, workflowId: string | null) {
  const { repository } = getAutomationServices();

  return useQuery({
    queryKey: automationWorkflowKey(companyId, workflowId),
    enabled: Boolean(companyId && workflowId),
    queryFn: () => repository.getById(companyId!, workflowId!),
  });
}

export function useAutomationHistory(
  companyId: string | null,
  page = 1,
  workflowId?: string,
) {
  const { repository } = getAutomationServices();

  return useQuery({
    queryKey: automationHistoryKey(companyId, page, workflowId),
    enabled: Boolean(companyId),
    placeholderData: (previous) => previous,
    queryFn: () => repository.listExecutions(companyId!, page, 20, workflowId),
  });
}

export function useAutomationExecutionHistory(executionId: string | null) {
  const { repository } = getAutomationServices();

  return useQuery({
    queryKey: automationExecutionHistoryKey(executionId),
    enabled: Boolean(executionId),
    queryFn: () => repository.listHistory(executionId!),
  });
}

export function useAutomationTemplates() {
  const { repository } = getAutomationServices();

  return useQuery({
    queryKey: automationTemplatesKey(),
    queryFn: () => repository.listTemplates(),
    staleTime: 60_000,
  });
}

export function useAutomationActions(companyId: string | null) {
  const qc = useQueryClient();
  const { repository, engine, runtime } = getAutomationServices();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: automationWorkflowsKey(companyId) });
    void qc.invalidateQueries({ queryKey: automationHistoryKey(companyId) });
  };

  const createWorkflow = useMutation({
    mutationFn: (input: AutomationWorkflowInput) => repository.create(companyId!, input),
    onSuccess: invalidate,
  });

  const updateWorkflow = useMutation({
    mutationFn: ({ workflowId, input }: { workflowId: string; input: Partial<AutomationWorkflowInput> }) =>
      repository.update(companyId!, workflowId, input),
    onSuccess: (_, variables) => {
      invalidate();
      void qc.invalidateQueries({ queryKey: automationWorkflowKey(companyId, variables.workflowId) });
    },
  });

  const setEnabled = useMutation({
    mutationFn: ({ workflowId, enabled }: { workflowId: string; enabled: boolean }) =>
      repository.setEnabled(companyId!, workflowId, enabled),
    onMutate: async ({ workflowId, enabled }) => {
      await qc.cancelQueries({ queryKey: automationWorkflowsKey(companyId) });
      const previous = qc.getQueryData(automationWorkflowsKey(companyId));
      qc.setQueryData(automationWorkflowsKey(companyId), (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((workflow) =>
          workflow.id === workflowId ? { ...workflow, enabled } : workflow,
        );
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        qc.setQueryData(automationWorkflowsKey(companyId), context.previous);
      }
    },
    onSettled: invalidate,
  });

  const deleteWorkflow = useMutation({
    mutationFn: (workflowId: string) => repository.delete(companyId!, workflowId),
    onSuccess: invalidate,
  });

  const installTemplate = useMutation({
    mutationFn: (templateKey: string) => {
      const template = getWorkflowTemplate(templateKey);
      if (!template) throw new Error("Template not found");
      const { templateKey: _key, category: _cat, ...input } = template;
      return repository.create(companyId!, input);
    },
    onSuccess: invalidate,
  });

  const runManual = useMutation({
    mutationFn: (workflowId: string) => engine.runManual(companyId!, workflowId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: automationHistoryKey(companyId) });
    },
  });

  const processDueSchedules = useMutation({
    mutationFn: () => runtime.processDueSchedules(companyId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: automationHistoryKey(companyId) });
    },
  });

  return {
    createWorkflow,
    updateWorkflow,
    setEnabled,
    deleteWorkflow,
    installTemplate,
    runManual,
    processDueSchedules,
  };
}
