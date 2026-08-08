import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { BillingSettingCategory, BillingSettingRow } from "@/lib/billing/types";

export function useBillingSettingsByCategory(
  category: BillingSettingCategory,
  scopeType: "platform" | "company" = "platform",
  companyId: string | null = null,
  enabled = true,
) {
  return useQuery({
    queryKey: ["billing", "settings", category, scopeType, companyId],
    enabled,
    queryFn: async (): Promise<BillingSettingRow[]> => {
      const { data, error } = await supabase.rpc("get_billing_settings_by_category", {
        p_category: category,
        p_scope_type: scopeType,
        p_company_id: companyId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as BillingSettingRow[];
    },
  });
}

export function useUpdateBillingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      scopeType: "platform" | "company";
      companyId: string | null;
      changes: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase.rpc("update_billing_settings", {
        p_scope_type: input.scopeType,
        p_company_id: input.companyId,
        p_changes: input.changes,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: (_data, variables) => {
      // Category lists + single-code setting readers (default_currency, etc.)
      void qc.invalidateQueries({ queryKey: ["billing", "settings"] });
      void qc.invalidateQueries({ queryKey: ["billing", "setting"] });
      void qc.invalidateQueries({ queryKey: ["billing", "health"] });
      void qc.invalidateQueries({ queryKey: ["billing", "audit-log"] });
      void qc.invalidateQueries({ queryKey: ["workspace", "billing"] });
      if (variables.companyId) {
        void qc.invalidateQueries({
          queryKey: ["billing", "entitlements", variables.companyId],
        });
      }
    },
  });
}
