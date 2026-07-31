import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { aiEmployeeSkillsKey } from "@/lib/ai-employees/cache";
import { getAiEmployeeServices } from "@/lib/ai-employees";
import { invalidateAiEmployeeQueries } from "@/lib/ai-employees/cache/ai-employee-query-keys";
import type { AiSkillListFilter, AiSkillPlatformSnapshot } from "@/lib/ai-employees/types";
import { filterMarketplaceSkills } from "@/lib/ai-employees/selectors/skill-selectors";
import { useAiEmployee } from "./use-ai-employees";

const services = getAiEmployeeServices();

export function useAiEmployeeSkills(companyId: string | null, agentId: string | null) {
  const { user } = useAuth();
  const employeeQuery = useAiEmployee(companyId, agentId);

  return useQuery({
    queryKey: aiEmployeeSkillsKey(companyId, agentId),
    enabled: Boolean(companyId && agentId && employeeQuery.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const employee = employeeQuery.data!;
      return services.skills.loadPlatformSnapshot({
        companyId: companyId!,
        employee,
        userId: user?.id ?? null,
      });
    },
  });
}

export function useAiEmployeeSkillsMarketplace(snapshot: AiSkillPlatformSnapshot | undefined) {
  const [filters, setFilters] = useState<AiSkillListFilter>({
    status: "all",
    category: "all",
    favoritesOnly: false,
  });

  const filteredMarketplace = useMemo(() => {
    if (!snapshot) return [];
    return filterMarketplaceSkills(snapshot.marketplace, filters);
  }, [snapshot, filters]);

  return { filters, setFilters, filteredMarketplace };
}

export function useAssignAiEmployeeSkills(companyId: string | null, agentId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (skillIds: string[]) => {
      if (!companyId || !agentId) throw new Error("Missing context");
      await services.skills.assignToEmployee({
        employeeId: agentId,
        companyId,
        skillIds,
        actorId: user?.id ?? null,
      });
    },
    onSuccess: () => {
      invalidateAiEmployeeQueries(queryClient, companyId, agentId);
      queryClient.invalidateQueries({ queryKey: aiEmployeeSkillsKey(companyId, agentId) });
    },
  });
}

export function useTestAiSkill(companyId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (skillId: string) => {
      if (!companyId) throw new Error("Missing company");
      return services.skills.testConfiguration(skillId, companyId, user?.id ?? null);
    },
    onSuccess: (_result, skillId) => {
      queryClient.invalidateQueries({ queryKey: aiEmployeeSkillsKey(companyId, null) });
      queryClient.invalidateQueries({ queryKey: [...aiEmployeeSkillsKey(companyId, null), skillId] });
    },
  });
}

export function useToggleAiSkillFavorite(companyId: string | null, agentId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { skillId: string; favorite: boolean }) => {
      if (!companyId || !user?.id) throw new Error("Missing context");
      await services.skills.toggleFavorite(companyId, input.skillId, user.id, input.favorite);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiEmployeeSkillsKey(companyId, agentId) });
    },
  });
}

export { formatAiEmployeeSkillError } from "@/lib/ai-employees/services/ai-employee-skill-errors";
