import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CompanyCommercialTerms } from "@/lib/billing/company-payable-amount";
import type { UsageLimitOverride } from "@/lib/billing/usage-overage";
import { COMPANIES_KEY } from "@/hooks/use-companies";

export const COMPANY_COMMERCIAL_TERMS_KEY = ["billing", "company-commercial-terms"] as const;

export type UsageMetricDefinition = {
  code: string;
  label: string;
  unit: string;
  billable: boolean;
  is_active: boolean;
};

export function useCompanyCommercialTerms(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...COMPANY_COMMERCIAL_TERMS_KEY, companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<CompanyCommercialTerms | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("company_commercial_terms")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CompanyCommercialTerms | null) ?? null;
    },
  });
}

export function useCompanyUsageLimitOverrides(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...COMPANY_COMMERCIAL_TERMS_KEY, "limits", companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<UsageLimitOverride[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("company_usage_limit_overrides")
        .select(
          "metric_code, included_quantity, is_unlimited, overage_allowed, overage_unit_size, overage_unit_price",
        )
        .eq("company_id", companyId)
        .eq("is_active", true);
      if (error) throw new Error(error.message);
      return (data ?? []) as UsageLimitOverride[];
    },
  });
}

export function useUsageMetricDefinitions(enabled = true) {
  return useQuery({
    queryKey: ["billing", "usage-metric-definitions"],
    enabled,
    queryFn: async (): Promise<UsageMetricDefinition[]> => {
      const { data, error } = await supabase
        .from("usage_metric_definitions")
        .select("code, label, unit, billable, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as UsageMetricDefinition[];
    },
  });
}

export function useCompanySubscriptionForReview(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["billing", "company-subscription-review", companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("company_subscriptions")
        .select("*, plan:plans(*)")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

function invalidateCommercial(qc: ReturnType<typeof useQueryClient>, companyId: string) {
  void qc.invalidateQueries({ queryKey: COMPANIES_KEY });
  void qc.invalidateQueries({ queryKey: COMPANY_COMMERCIAL_TERMS_KEY });
  void qc.invalidateQueries({ queryKey: ["billing"] });
  void qc.invalidateQueries({ queryKey: ["billing", "company-subscription-review", companyId] });
}

export function useUpsertCompanyCommercialTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      pricingSource: CompanyCommercialTerms["pricing_source"];
      discountPercent?: number;
      customPriceMonthly?: number | null;
      customPriceYearly?: number | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("upsert_company_commercial_terms_v1", {
        p_company_id: input.companyId,
        p_pricing_source: input.pricingSource,
        p_discount_percent: input.discountPercent ?? 0,
        p_custom_price_monthly: input.customPriceMonthly ?? null,
        p_custom_price_yearly: input.customPriceYearly ?? null,
        p_notes: input.notes ?? null,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: (_data, variables) => invalidateCommercial(qc, variables.companyId),
  });
}

export function useUpsertCompanyUsageLimitOverrides() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { companyId: string; rows: UsageLimitOverride[] }) => {
      const { data, error } = await supabase.rpc("upsert_company_usage_limit_overrides_v1", {
        p_company_id: input.companyId,
        p_rows: input.rows,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: (_data, variables) => invalidateCommercial(qc, variables.companyId),
  });
}

export function useRequestCompanyChanges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { companyId: string; message: string }) => {
      const { data, error } = await supabase.rpc("request_company_changes_v1", {
        p_company_id: input.companyId,
        p_message: input.message,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: (_data, variables) => invalidateCommercial(qc, variables.companyId),
  });
}

export function useCompanyPayablePreview(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...COMPANY_COMMERCIAL_TERMS_KEY, "payable", companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase.rpc("resolve_company_payable_amount", {
        p_company_id: companyId,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
  });
}
