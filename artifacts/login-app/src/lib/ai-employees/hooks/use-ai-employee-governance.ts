import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { aiEmployeeGovernanceKey } from "@/lib/ai-employees/cache";
import { getAiEmployeeServices } from "@/lib/ai-employees";
import { invalidateAiEmployeeQueries } from "@/lib/ai-employees/cache/ai-employee-query-keys";
import type { AiGovernancePolicyFormValues } from "@/lib/ai-employees/types";
import { useAiEmployee } from "./use-ai-employees";

const services = getAiEmployeeServices();

export function useAiEmployeeGovernance(companyId: string | null, agentId: string | null) {
  const employeeQuery = useAiEmployee(companyId, agentId);

  return useQuery({
    queryKey: aiEmployeeGovernanceKey(companyId, agentId),
    enabled: Boolean(companyId && agentId && employeeQuery.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const employee = employeeQuery.data!;
      return services.governance.loadSnapshot(companyId!, employee);
    },
  });
}

export function useCreateAiGovernancePolicy(companyId: string | null, agentId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: AiGovernancePolicyFormValues) => {
      if (!companyId) throw new Error("Missing company");
      return services.governance.createPolicy({
        companyId,
        values,
        actorId: user?.id ?? null,
      });
    },
    onSuccess: () => {
      invalidateAiEmployeeQueries(queryClient, companyId, agentId);
      queryClient.invalidateQueries({ queryKey: aiEmployeeGovernanceKey(companyId, agentId) });
    },
  });
}

export function useArchiveAiGovernancePolicy(companyId: string | null, agentId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (policyId: string) => {
      if (!companyId) throw new Error("Missing company");
      return services.governance.archivePolicy(policyId, companyId, user?.id ?? null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiEmployeeGovernanceKey(companyId, agentId) });
    },
  });
}

export function useRestoreAiGovernancePolicy(companyId: string | null, agentId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (policyId: string) => {
      if (!companyId) throw new Error("Missing company");
      return services.governance.restorePolicy(policyId, companyId, user?.id ?? null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiEmployeeGovernanceKey(companyId, agentId) });
    },
  });
}

export { formatAiEmployeeGovernanceError } from "@/lib/ai-employees/services/ai-employee-governance-errors";
