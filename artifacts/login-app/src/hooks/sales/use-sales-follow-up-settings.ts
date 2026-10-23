import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_SALES_FOLLOW_UP_FORM,
  normalizeSalesFollowUpForm,
  salesFollowUpConfigState,
  salesFollowUpFormToRow,
  validateSalesFollowUpForm,
  type SalesFollowUpSettingsFormValues,
  type SalesFollowUpSettingsSnapshot,
} from "@/lib/sales-follow-up/sales-follow-up-settings";

export const SALES_FOLLOW_UP_SETTINGS_KEY = ["sales", "follow-up-settings"] as const;

export function salesFollowUpSettingsKey(companyId: string | null) {
  return [...SALES_FOLLOW_UP_SETTINGS_KEY, companyId] as const;
}

function settingsReadError(message: string): Error {
  if (/relation .* does not exist|Could not find the table/i.test(message)) {
    return new Error(
      "Sales follow-up settings table is missing. Apply migration 421 on the local database before using this page.",
    );
  }
  if (/permission|rls|row-level|401|403/i.test(message)) {
    return new Error(`Not allowed to read sales follow-up settings: ${message}`);
  }
  return new Error(`Could not load sales follow-up settings: ${message}`);
}

export function useSalesFollowUpSettings(companyId: string | null) {
  return useQuery({
    queryKey: salesFollowUpSettingsKey(companyId),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<SalesFollowUpSettingsSnapshot> => {
      if (!companyId) throw new Error("Company required");
      const { data, error } = await supabase
        .from("sales_follow_up_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw settingsReadError(error.message);
      // No row yet → safe defaults (feature off) flagged "unconfigured"; never auto-created or enabled.
      // Real DB/RLS failures throw above.
      return { form: normalizeSalesFollowUpForm(data), configState: salesFollowUpConfigState(data) };
    },
  });
}

export function useSaveSalesFollowUpSettings(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: SalesFollowUpSettingsFormValues) => {
      if (!companyId) throw new Error("Company required");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const validationError = validateSalesFollowUpForm(values);
      // Page maps these codes to localized toasts; keep English fallback for non-UI callers.
      if (validationError === "channels_required_when_enabled") {
        throw new Error("channels_required_when_enabled");
      }
      if (validationError === "schedule_steps_required") {
        throw new Error("schedule_steps_required");
      }
      if (validationError) {
        throw new Error(`Invalid follow-up settings: ${validationError}`);
      }

      const payload = salesFollowUpFormToRow(companyId, values);
      const { data, error } = await supabase
        .from("sales_follow_up_settings")
        .upsert(payload, { onConflict: "company_id" })
        .select("*")
        .single();
      if (error) {
        if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
          throw new Error(
            "Sales follow-up settings table is missing. Apply migration 421 before saving.",
          );
        }
        throw new Error(error.message);
      }

      // When automation is turned off, cancel pending/claimed jobs (keep history).
      if (!payload.enabled) {
        await supabase
          .from("sales_follow_up_jobs")
          .update({
            status: "cancelled",
            last_outcome: "cancelled",
            error_message: "automation_disabled",
            claim_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("company_id", companyId)
          .in("status", ["pending", "claimed"]);
      }

      return normalizeSalesFollowUpForm(data ?? DEFAULT_SALES_FOLLOW_UP_FORM);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: salesFollowUpSettingsKey(companyId) });
    },
  });
}
