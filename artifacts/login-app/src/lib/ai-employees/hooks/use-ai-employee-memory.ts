import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAgentRuntimeServices } from "@/lib/agent-runtime";
import { aiEmployeeMemoryKey } from "@/lib/ai-employees/cache";
import { getAiEmployeeServices } from "@/lib/ai-employees";
import type { AiEmployeeMemorySearchFilters } from "@/lib/ai-employees/types";
import {
  filterMemoryEntries,
  listMemorySources,
  listMemoryTypes,
} from "@/lib/ai-employees/selectors/memory-selectors";
import { useAiEmployee } from "./use-ai-employees";
import { useAiEmployeeRuntimePreview } from "./use-ai-employee-runtime-config";

const services = getAiEmployeeServices();

export function useAiEmployeeMemory(companyId: string | null, agentId: string | null) {
  const { services: runtimeServices, context } = useAgentRuntimeServices();
  const employeeQuery = useAiEmployee(companyId, agentId);
  const previewQuery = useAiEmployeeRuntimePreview(companyId, agentId);

  return useQuery({
    queryKey: aiEmployeeMemoryKey(companyId, agentId),
    enabled: Boolean(companyId && agentId && employeeQuery.data),
    staleTime: 15_000,
    refetchInterval: 25_000,
    queryFn: async () => {
      const employee = employeeQuery.data!;
      return services.memory.loadSnapshot(context, runtimeServices.runtime, employee, previewQuery.data ?? null);
    },
  });
}

export function useAiEmployeeMemorySearch(snapshot: ReturnType<typeof useAiEmployeeMemory>["data"]) {
  const [filters, setFilters] = useState<AiEmployeeMemorySearchFilters>({
    type: "all",
    source: "all",
  });

  const filteredEntries = useMemo(() => {
    if (!snapshot) return [];
    return filterMemoryEntries(snapshot.longTerm, filters);
  }, [snapshot, filters]);

  const sources = useMemo(() => (snapshot ? listMemorySources(snapshot.longTerm) : []), [snapshot]);
  const types = useMemo(() => listMemoryTypes(), []);

  return {
    filters,
    setFilters,
    filteredEntries,
    sources,
    types,
  };
}
