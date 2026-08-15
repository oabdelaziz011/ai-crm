import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommercialPackage } from "@/lib/billing/package-feature-groups";
import { supabase } from "@/lib/supabase";

export const COMMERCIAL_PACKAGES_KEY = ["billing", "commercial-packages"] as const;

export type PackageFeatureRow = {
  feature_code: string;
  enabled: boolean;
  limit_value: unknown;
  label?: string | null;
  category?: string | null;
};

export function useCommercialPackages(enabled = true) {
  return useQuery({
    queryKey: COMMERCIAL_PACKAGES_KEY,
    enabled,
    queryFn: async (): Promise<CommercialPackage[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as CommercialPackage[];
    },
  });
}

export function usePackageFeatures(planId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...COMMERCIAL_PACKAGES_KEY, "features", planId],
    enabled: enabled && Boolean(planId),
    queryFn: async (): Promise<PackageFeatureRow[]> => {
      if (!planId) return [];
      const { data, error } = await supabase
        .from("plan_features")
        .select("feature_code, enabled, limit_value, feature_definitions(label, category)")
        .eq("plan_id", planId)
        .eq("enabled", true)
        .order("feature_code", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => {
        const fd = Array.isArray(row.feature_definitions)
          ? row.feature_definitions[0]
          : row.feature_definitions;
        return {
          feature_code: String(row.feature_code),
          enabled: Boolean(row.enabled),
          limit_value: row.limit_value,
          label: fd && typeof fd === "object" ? String((fd as { label?: string }).label ?? "") : null,
          category:
            fd && typeof fd === "object" ? String((fd as { category?: string }).category ?? "") : null,
        };
      });
    },
  });
}

export type UpsertPackageInput = {
  code: string;
  name: string;
  planId?: string | null;
  displayName?: string | null;
  description?: string | null;
  pricingMode?: "free" | "fixed" | "custom";
  priceMonthly?: number;
  priceYearly?: number;
  isActive?: boolean;
  isHighlighted?: boolean;
  isPublic?: boolean;
  sortOrder?: number;
  tierRank?: number;
};

export function useUpsertCommercialPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertPackageInput) => {
      const { data, error } = await supabase.rpc("upsert_commercial_package_v1", {
        p_code: input.code,
        p_name: input.name,
        p_id: input.planId ?? null,
        p_display_name: input.displayName ?? null,
        p_description: input.description ?? null,
        p_price_monthly: input.priceMonthly ?? 0,
        p_price_yearly: input.priceYearly ?? 0,
        p_is_active: input.isActive ?? true,
        p_is_highlighted: input.isHighlighted ?? false,
        p_is_public: input.isPublic ?? true,
        p_sort_order: input.sortOrder ?? 0,
        p_tier_rank: input.tierRank ?? 0,
        p_pricing_mode: input.pricingMode ?? null,
      });
      if (error) throw new Error(error.message);
      return data as { id?: string; plan_id?: string; code?: string; created?: boolean };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: COMMERCIAL_PACKAGES_KEY });
      void qc.invalidateQueries({ queryKey: ["billing", "plans-catalog"] });
      void qc.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useSetCommercialPackageFeatures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { planId: string; featureCodes: string[] }) => {
      const { data, error } = await supabase.rpc("set_commercial_package_features_v1", {
        p_plan_id: input.planId,
        p_feature_codes: input.featureCodes,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: [...COMMERCIAL_PACKAGES_KEY, "features", vars.planId] });
      void qc.invalidateQueries({ queryKey: COMMERCIAL_PACKAGES_KEY });
    },
  });
}

export function useAssignCompanyPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      planId: string;
      billingCycle?: "monthly" | "yearly" | null;
    }) => {
      const { data, error } = await supabase.rpc("assign_company_package_v1", {
        p_company_id: input.companyId,
        p_plan_id: input.planId,
        p_billing_cycle: input.billingCycle ?? null,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["billing"] });
      void qc.invalidateQueries({ queryKey: ["company-subscriptions"] });
      void qc.invalidateQueries({ queryKey: ["billing", "entitlements", vars.companyId] });
    },
  });
}
