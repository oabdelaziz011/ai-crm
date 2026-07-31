import type { QueryClient } from "@tanstack/react-query";
import type { AiEmployeeListFilter } from "@/lib/ai-employees/types";

export const AI_EMPLOYEES_KEY = ["ai-employees"] as const;

export function aiEmployeesListKey(companyId: string | null, filter: AiEmployeeListFilter = {}) {
  return [...AI_EMPLOYEES_KEY, "list", companyId, filter] as const;
}

export function aiEmployeeDetailKey(companyId: string | null, agentId: string | null) {
  return [...AI_EMPLOYEES_KEY, "detail", companyId, agentId] as const;
}

export function aiEmployeeToolsKey() {
  return [...AI_EMPLOYEES_KEY, "tools"] as const;
}

export function aiEmployeeKnowledgeKey(companyId: string | null) {
  return [...AI_EMPLOYEES_KEY, "knowledge", companyId] as const;
}

export function aiEmployeeRuntimePreviewKey(companyId: string | null, agentId: string | null) {
  return [...AI_EMPLOYEES_KEY, "runtime-preview", companyId, agentId] as const;
}

export function aiEmployeeVersionsKey(companyId: string | null, agentId: string | null) {
  return [...AI_EMPLOYEES_KEY, "versions", companyId, agentId] as const;
}

export function aiEmployeeDeploymentsKey(companyId: string | null, agentId: string | null) {
  return [...AI_EMPLOYEES_KEY, "deployments", companyId, agentId] as const;
}

export function aiEmployeeChangeEventsKey(companyId: string | null, agentId: string | null) {
  return [...AI_EMPLOYEES_KEY, "change-events", companyId, agentId] as const;
}

export function aiEmployeeLifecycleKey(companyId: string | null, agentId: string | null) {
  return [...AI_EMPLOYEES_KEY, "lifecycle", companyId, agentId] as const;
}

export function aiEmployeeOperationsKey(companyId: string | null, agentId: string | null) {
  return [...AI_EMPLOYEES_KEY, "operations", companyId, agentId] as const;
}

export function aiEmployeeMemoryKey(companyId: string | null, agentId: string | null) {
  return [...AI_EMPLOYEES_KEY, "memory", companyId, agentId] as const;
}

export function aiEmployeeSkillsKey(companyId: string | null, agentId: string | null) {
  return [...AI_EMPLOYEES_KEY, "skills", companyId, agentId] as const;
}

export function aiEmployeeCollaborationKey(companyId: string | null, agentId: string | null) {
  return [...AI_EMPLOYEES_KEY, "collaboration", companyId, agentId] as const;
}

export function aiEmployeeGovernanceKey(companyId: string | null, agentId: string | null) {
  return [...AI_EMPLOYEES_KEY, "governance", companyId, agentId] as const;
}

export function aiEmployeeAdministrationKey(companyId: string | null, agentId: string | null) {
  return [...AI_EMPLOYEES_KEY, "administration", companyId, agentId] as const;
}

export function aiEmployeeVersionCompareKey(
  companyId: string | null,
  agentId: string | null,
  leftVersion: number | null,
  rightVersion: number | null,
) {
  return [...AI_EMPLOYEES_KEY, "version-compare", companyId, agentId, leftVersion, rightVersion] as const;
}

export function invalidateAiEmployeeQueries(
  queryClient: QueryClient,
  companyId: string | null,
  agentId?: string | null,
) {
  queryClient.invalidateQueries({ queryKey: [...AI_EMPLOYEES_KEY, "list", companyId] });
  if (agentId) {
    queryClient.invalidateQueries({ queryKey: aiEmployeeDetailKey(companyId, agentId) });
    queryClient.invalidateQueries({ queryKey: aiEmployeeRuntimePreviewKey(companyId, agentId) });
    queryClient.invalidateQueries({ queryKey: aiEmployeeVersionsKey(companyId, agentId) });
    queryClient.invalidateQueries({ queryKey: aiEmployeeDeploymentsKey(companyId, agentId) });
    queryClient.invalidateQueries({ queryKey: aiEmployeeChangeEventsKey(companyId, agentId) });
    queryClient.invalidateQueries({ queryKey: aiEmployeeLifecycleKey(companyId, agentId) });
    queryClient.invalidateQueries({ queryKey: aiEmployeeOperationsKey(companyId, agentId) });
    queryClient.invalidateQueries({ queryKey: aiEmployeeMemoryKey(companyId, agentId) });
    queryClient.invalidateQueries({ queryKey: aiEmployeeSkillsKey(companyId, agentId) });
    queryClient.invalidateQueries({ queryKey: aiEmployeeCollaborationKey(companyId, agentId) });
    queryClient.invalidateQueries({ queryKey: aiEmployeeGovernanceKey(companyId, agentId) });
    queryClient.invalidateQueries({ queryKey: aiEmployeeAdministrationKey(companyId, agentId) });
  }
}
