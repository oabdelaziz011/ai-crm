import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useAgentRuntimeServices } from "@/lib/agent-runtime";
import { aiEmployeeCollaborationKey } from "@/lib/ai-employees/cache";
import { getAiEmployeeServices } from "@/lib/ai-employees";
import { invalidateAiEmployeeQueries } from "@/lib/ai-employees/cache/ai-employee-query-keys";
import type { AiEmployeeEscalationType } from "@/lib/ai-employees/types";
import { useAiEmployee } from "./use-ai-employees";
import { useAiEmployeeRuntimePreview } from "./use-ai-employee-runtime-config";

const services = getAiEmployeeServices();

export function useAiEmployeeCollaboration(companyId: string | null, agentId: string | null) {
  const { services: runtimeServices, context } = useAgentRuntimeServices();
  const employeeQuery = useAiEmployee(companyId, agentId);
  const previewQuery = useAiEmployeeRuntimePreview(companyId, agentId);

  return useQuery({
    queryKey: aiEmployeeCollaborationKey(companyId, agentId),
    enabled: Boolean(companyId && agentId && employeeQuery.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const employee = employeeQuery.data!;
      return services.collaboration.loadSnapshot(
        context,
        runtimeServices.runtime,
        employee,
        previewQuery.data ?? null,
      );
    },
  });
}

export function useRequestAiEmployeeHandover(companyId: string | null, agentId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      destinationEmployeeId: string;
      reason: string;
      escalationType?: AiEmployeeEscalationType;
    }) => {
      if (!companyId || !agentId) throw new Error("Missing context");
      return services.collaboration.requestHandover({
        companyId,
        sourceEmployeeId: agentId,
        destinationEmployeeId: input.destinationEmployeeId,
        reason: input.reason,
        escalationType: input.escalationType,
        actorId: user?.id ?? null,
      });
    },
    onSuccess: () => {
      invalidateAiEmployeeQueries(queryClient, companyId, agentId);
      queryClient.invalidateQueries({ queryKey: aiEmployeeCollaborationKey(companyId, agentId) });
    },
  });
}

export { formatAiEmployeeCollaborationError } from "@/lib/ai-employees/services/ai-employee-collaboration-errors";
