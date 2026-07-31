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

export function invalidateAiEmployeeQueries(
  queryClient: QueryClient,
  companyId: string | null,
  agentId?: string | null,
) {
  queryClient.invalidateQueries({ queryKey: [...AI_EMPLOYEES_KEY, "list", companyId] });
  if (agentId) {
    queryClient.invalidateQueries({ queryKey: aiEmployeeDetailKey(companyId, agentId) });
    queryClient.invalidateQueries({ queryKey: aiEmployeeRuntimePreviewKey(companyId, agentId) });
  }
}
