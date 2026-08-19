import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CompanyResourceOccupancy } from "@/lib/billing/company-resource-limits";

export const COMPANY_RESOURCE_OCCUPANCY_KEY = ["billing", "company-resource-occupancy"] as const;

export function useCompanyResourceOccupancy(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...COMPANY_RESOURCE_OCCUPANCY_KEY, companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<CompanyResourceOccupancy | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase.rpc("get_company_resource_occupancy_v1", {
        p_company_id: companyId,
      });
      if (error) throw new Error(error.message);
      return (data as CompanyResourceOccupancy | null) ?? null;
    },
  });
}

export function useSetCompanyResourceLimits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      maxUsers: number | null;
      maxBranches: number | null;
      source?: "contract" | "manual";
    }) => {
      const { data, error } = await supabase.rpc("set_company_resource_limits_v1", {
        p_company_id: input.companyId,
        p_max_users: input.maxUsers,
        p_max_branches: input.maxBranches,
        p_source: input.source ?? "contract",
      });
      if (error) throw new Error(error.message);
      return data as CompanyResourceOccupancy;
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: [...COMPANY_RESOURCE_OCCUPANCY_KEY, variables.companyId],
      });
    },
  });
}
