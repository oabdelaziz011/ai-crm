import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAgentRuntimeServices } from "@/lib/agent-runtime";
import { aiEmployeeAdministrationKey } from "@/lib/ai-employees/cache";
import { getAiEmployeeServices } from "@/lib/ai-employees";
import type { AiControlTowerSnapshot } from "@/lib/ai-employees/types";
import { filterEmployees } from "@/lib/ai-employees/selectors/administration-selectors";
import { useAiEmployee } from "./use-ai-employees";
import { useAiEmployeeRuntimePreview } from "./use-ai-employee-runtime-config";

const services = getAiEmployeeServices();

export function useAiEmployeeAdministration(companyId: string | null, agentId: string | null) {
  const { services: runtimeServices, context } = useAgentRuntimeServices();
  const employeeQuery = useAiEmployee(companyId, agentId);
  const previewQuery = useAiEmployeeRuntimePreview(companyId, agentId);

  return useQuery({
    queryKey: aiEmployeeAdministrationKey(companyId, agentId),
    enabled: Boolean(companyId && agentId && employeeQuery.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const employee = employeeQuery.data!;
      return services.administration.loadControlTowerSnapshot({
        ctx: context,
        runtime: runtimeServices.runtime,
        companyId: companyId!,
        focusEmployee: employee,
        preview: previewQuery.data ?? null,
      });
    },
  });
}

export function useControlTowerEmployeeFilter(snapshot: AiControlTowerSnapshot | undefined) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [department, setDepartment] = useState<string>("all");

  const filteredEmployees = useMemo(() => {
    if (!snapshot) return [];
    return filterEmployees(snapshot.employees, { search, status, department });
  }, [snapshot, search, status, department]);

  const departments = useMemo(() => {
    if (!snapshot) return [];
    const set = new Set<string>();
    for (const entry of snapshot.employees) {
      if (entry.department?.trim()) set.add(entry.department.trim());
    }
    return [...set].sort();
  }, [snapshot]);

  return { search, setSearch, status, setStatus, department, setDepartment, filteredEmployees, departments };
}
