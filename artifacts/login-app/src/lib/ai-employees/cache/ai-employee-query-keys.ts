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
  // Broad list invalidation — includes every filter variant for the company.
  void queryClient.invalidateQueries({
    queryKey: [...AI_EMPLOYEES_KEY, "list"],
    refetchType: "active",
  });
  if (companyId) {
    void queryClient.invalidateQueries({
      queryKey: [...AI_EMPLOYEES_KEY, "list", companyId],
      refetchType: "all",
    });
  }
  if (agentId) {
    void queryClient.invalidateQueries({ queryKey: aiEmployeeDetailKey(companyId, agentId) });
    void queryClient.invalidateQueries({ queryKey: aiEmployeeRuntimePreviewKey(companyId, agentId) });
    void queryClient.invalidateQueries({ queryKey: aiEmployeeVersionsKey(companyId, agentId) });
    void queryClient.invalidateQueries({ queryKey: aiEmployeeDeploymentsKey(companyId, agentId) });
    void queryClient.invalidateQueries({ queryKey: aiEmployeeChangeEventsKey(companyId, agentId) });
    void queryClient.invalidateQueries({ queryKey: aiEmployeeLifecycleKey(companyId, agentId) });
    void queryClient.invalidateQueries({ queryKey: aiEmployeeOperationsKey(companyId, agentId) });
    void queryClient.invalidateQueries({ queryKey: aiEmployeeMemoryKey(companyId, agentId) });
    void queryClient.invalidateQueries({ queryKey: aiEmployeeSkillsKey(companyId, agentId) });
    void queryClient.invalidateQueries({ queryKey: aiEmployeeCollaborationKey(companyId, agentId) });
    void queryClient.invalidateQueries({ queryKey: aiEmployeeGovernanceKey(companyId, agentId) });
    void queryClient.invalidateQueries({ queryKey: aiEmployeeAdministrationKey(companyId, agentId) });
  }
}

/** Keep list UIs in sync immediately after create/update (avoids missing draft rows). */
export function upsertAiEmployeeInListCaches(
  queryClient: QueryClient,
  companyId: string | null,
  employee: { id: string },
) {
  if (!companyId) return;
  queryClient.setQueriesData<unknown>(
    { queryKey: [...AI_EMPLOYEES_KEY, "list", companyId] },
    (current) => {
      if (!Array.isArray(current)) return current;
      const list = current as Array<{ id: string }>;
      const index = list.findIndex((row) => row.id === employee.id);
      if (index === -1) {
        return [employee, ...list];
      }
      const next = list.slice();
      next[index] = { ...list[index], ...employee };
      return next;
    },
  );
}
