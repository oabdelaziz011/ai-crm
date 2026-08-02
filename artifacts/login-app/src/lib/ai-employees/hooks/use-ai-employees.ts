import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import {
  aiEmployeeDetailKey,
  aiEmployeeKnowledgeKey,
  aiEmployeesListKey,
  aiEmployeeToolsKey,
  invalidateAiEmployeeQueries,
} from "@/lib/ai-employees/cache";
import { getAiEmployeeServices } from "@/lib/ai-employees";
import { AiEmployeeRegistryError } from "@/lib/ai-employees/services";
import { aiEmployeesTrace } from "@/lib/ai-employees/debug/ai-employees-trace";
import type { AiEmployeeFormValues, AiEmployeeListFilter } from "@/lib/ai-employees/types";

const services = getAiEmployeeServices();

export function useAiEmployees(companyId: string | null, filter: AiEmployeeListFilter = {}) {
  const queryKey = aiEmployeesListKey(companyId, filter);
  const enabled = Boolean(companyId);
  const hookPayload = { companyId, enabled, queryKey };
  console.log("[AI_EMPLOYEES_TRACE use-ai-employees]", hookPayload);
  aiEmployeesTrace("use-ai-employees", hookPayload);

  const query = useQuery({
    queryKey,
    enabled,
    queryFn: () => services.registry.list(companyId!, filter),
  });

  const resultPayload = {
    data: query.data,
    employees: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    status: query.status,
    fetchStatus: query.fetchStatus,
  };
  console.log("[AI_EMPLOYEES_TRACE use-ai-employees result]", resultPayload);
  aiEmployeesTrace("use-ai-employees result", resultPayload);

  return query;
}

export function useAiEmployeesInfinite(companyId: string | null, filter: AiEmployeeListFilter = {}) {
  return useInfiniteQuery({
    queryKey: [...aiEmployeesListKey(companyId, filter), "infinite"],
    enabled: Boolean(companyId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => services.registry.listPage(companyId!, filter, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useAiEmployee(companyId: string | null, agentId: string | null) {
  return useQuery({
    queryKey: aiEmployeeDetailKey(companyId, agentId),
    enabled: Boolean(companyId && agentId),
    queryFn: () => services.registry.getById(agentId!, companyId!),
  });
}

export function useAiEmployeeToolOptions() {
  return useQuery({
    queryKey: aiEmployeeToolsKey(),
    staleTime: 60_000,
    queryFn: () => services.registry.listToolOptions(),
  });
}

export function useAiEmployeeKnowledgeOptions(companyId: string | null) {
  return useQuery({
    queryKey: aiEmployeeKnowledgeKey(companyId),
    enabled: Boolean(companyId),
    queryFn: () => services.registry.listKnowledgeOptions(companyId!),
  });
}

export function useCreateAiEmployee(companyId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (values: AiEmployeeFormValues) => {
      if (!companyId) throw new Error("Company required");
      return services.registry.create(companyId, values, user?.id ?? null);
    },
    onSuccess: (employee) => {
      invalidateAiEmployeeQueries(qc, companyId, employee.id);
    },
  });
}

export function useUpdateAiEmployee(companyId: string | null, agentId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (values: AiEmployeeFormValues) => {
      if (!companyId || !agentId) throw new Error("AI Employee required");
      return services.registry.update(agentId, companyId, values, user?.id ?? null);
    },
    onSettled: () => {
      invalidateAiEmployeeQueries(qc, companyId, agentId);
    },
  });
}

export function useDeleteAiEmployee(companyId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (agentId: string) => {
      if (!companyId) throw new Error("Company required");
      return services.registry.softDelete(agentId, companyId, user?.id ?? null);
    },
    onSuccess: (_result, agentId) => {
      invalidateAiEmployeeQueries(qc, companyId, agentId);
    },
  });
}

export function formatAiEmployeeError(error: unknown): string {
  if (error instanceof AiEmployeeRegistryError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred";
}

export { invalidateAiEmployeeQueries };
