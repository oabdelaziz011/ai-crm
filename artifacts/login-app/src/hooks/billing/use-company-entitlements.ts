import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  bindCompanyFeatureEntitlementClient,
  getCompanyFeatureEntitlements,
  syncCompanyPackageEntitlements,
} from "@/lib/billing/company-feature-entitlement-service";
import type { CompanyEntitlement, CompanyUsageSnapshot } from "@/lib/billing/types";

bindCompanyFeatureEntitlementClient(supabase);

export function useCompanyEntitlements(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["billing", "entitlements", companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<CompanyEntitlement[]> => {
      if (!companyId) return [];
      return getCompanyFeatureEntitlements(companyId);
    },
  });
}

/** Re-provision source=package grants from the company subscription plan. */
export function useSyncCompanyPackageEntitlements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: string) => syncCompanyPackageEntitlements(companyId),
    onSuccess: (_data, companyId) => {
      qc.invalidateQueries({ queryKey: ["billing", "entitlements", companyId] });
    },
  });
}

export function useCompanyUsageSnapshot(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["billing", "usage-snapshot", companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<CompanyUsageSnapshot | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("company_usage_snapshots")
        .select("*")
        .eq("company_id", companyId)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CompanyUsageSnapshot | null) ?? null;
    },
  });
}

export function usePlansCatalog(enabled = true) {
  return useQuery({
    queryKey: ["billing", "plans-catalog"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
