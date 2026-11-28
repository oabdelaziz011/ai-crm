import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  companyOrderConfigState,
  companyOrderSettingsToRow,
  DEFAULT_COMPANY_ORDER_SETTINGS,
  normalizeCompanyOrderSettings,
  validateCompanyOrderSettings,
  type CompanyOrderConfigState,
  type CompanyOrderSettingsFormValues,
} from "@/lib/sales-order-settings/company-order-settings";

export const COMPANY_ORDER_SETTINGS_KEY = ["sales", "company-order-settings"] as const;

export function companyOrderSettingsKey(companyId: string | null) {
  return [...COMPANY_ORDER_SETTINGS_KEY, companyId] as const;
}

export type CompanyOrderSettingsSnapshot = {
  form: CompanyOrderSettingsFormValues;
  configState: CompanyOrderConfigState;
};

function settingsReadError(message: string): Error {
  if (/relation .* does not exist|Could not find the table/i.test(message)) {
    return new Error(
      "Company order settings table is missing. Apply migration 470 on the local database before using this page.",
    );
  }
  if (/permission|rls|row-level|401|403/i.test(message)) {
    return new Error(`Not allowed to read company order settings: ${message}`);
  }
  return new Error(`Could not load company order settings: ${message}`);
}

export function useCompanyOrderSettings(companyId: string | null) {
  return useQuery({
    queryKey: companyOrderSettingsKey(companyId),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<CompanyOrderSettingsSnapshot> => {
      if (!companyId) throw new Error("Company required");
      const { data, error } = await supabase
        .from("company_order_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw settingsReadError(error.message);
      return {
        form: normalizeCompanyOrderSettings(data),
        configState: companyOrderConfigState(data),
      };
    },
  });
}

export function useSaveCompanyOrderSettings(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: CompanyOrderSettingsFormValues) => {
      if (!companyId) throw new Error("Company required");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const validationError = validateCompanyOrderSettings(values);
      if (validationError) throw new Error(validationError);

      const payload = companyOrderSettingsToRow(companyId, values);
      const { data, error } = await supabase
        .from("company_order_settings")
        .upsert(payload, { onConflict: "company_id" })
        .select("*")
        .single();
      if (error) {
        if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
          throw new Error(
            "Company order settings table is missing. Apply migration 470 before saving.",
          );
        }
        throw new Error(error.message);
      }
      return normalizeCompanyOrderSettings(data ?? DEFAULT_COMPANY_ORDER_SETTINGS);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyOrderSettingsKey(companyId) });
    },
  });
}
