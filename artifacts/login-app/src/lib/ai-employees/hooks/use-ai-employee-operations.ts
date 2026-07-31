import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useAgentRuntimeServices } from "@/lib/agent-runtime";
import { aiEmployeeOperationsKey, invalidateAiEmployeeQueries } from "@/lib/ai-employees/cache";
import { getAiEmployeeServices } from "@/lib/ai-employees";
import type { AiEmployeeOperationsControlAction, AiEmployeeRecord } from "@/lib/ai-employees/types";
import { useAiEmployee } from "./use-ai-employees";

const services = getAiEmployeeServices();

export function useAiEmployeeOperations(companyId: string | null, agentId: string | null) {
  const { services: runtimeServices, context } = useAgentRuntimeServices();
  const employeeQuery = useAiEmployee(companyId, agentId);

  return useQuery({
    queryKey: aiEmployeeOperationsKey(companyId, agentId),
    enabled: Boolean(companyId && agentId && employeeQuery.data),
    staleTime: 15_000,
    refetchInterval: 20_000,
    queryFn: async () => {
      const employee = employeeQuery.data as AiEmployeeRecord;
      return services.operations.loadSnapshot(context, runtimeServices.runtime, employee);
    },
  });
}

export function useAiEmployeeOperationsControl(companyId: string | null, agentId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (action: AiEmployeeOperationsControlAction) => {
      if (!companyId || !agentId) throw new Error("AI Employee required");
      const actorId = user?.id ?? null;
      switch (action) {
        case "pause":
          return services.operations.pause(agentId, companyId, actorId);
        case "resume":
          return services.operations.resume(agentId, companyId, actorId);
        case "disable":
          return services.operations.disable(agentId, companyId, actorId);
        case "restart":
          return services.operations.restart(agentId, companyId, actorId);
        default:
          throw new Error("Unsupported control action");
      }
    },
    onSettled: () => {
      invalidateAiEmployeeQueries(qc, companyId, agentId);
      qc.invalidateQueries({ queryKey: aiEmployeeOperationsKey(companyId, agentId) });
    },
  });
}
