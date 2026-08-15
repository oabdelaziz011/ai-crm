import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_TICKET_SLA_SETTINGS,
  normalizeTicketSlaSettings,
  type TicketSlaSettingsFormValues,
} from "@/lib/tickets/ticket-sla-settings";

export const TICKET_SLA_SETTINGS_KEY = ["tickets", "sla-settings"] as const;

export function ticketSlaSettingsKey(companyId: string | null) {
  return [...TICKET_SLA_SETTINGS_KEY, companyId] as const;
}

export function useTicketSlaSettings(companyId: string | null) {
  return useQuery({
    queryKey: ticketSlaSettingsKey(companyId),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<TicketSlaSettingsFormValues> => {
      const { data, error } = await supabase
        .from("company_ticket_sla_settings")
        .select("urgent_hours, high_hours, normal_hours, low_hours, warning_hours")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return normalizeTicketSlaSettings(data);
    },
  });
}

export function useSaveTicketSlaSettings(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: TicketSlaSettingsFormValues) => {
      if (!companyId) throw new Error("Company required");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const payload = {
        company_id: companyId,
        urgent_hours: values.urgentHours,
        high_hours: values.highHours,
        normal_hours: values.normalHours,
        low_hours: values.lowHours,
        warning_hours: values.warningHours,
        updated_by: user.id,
      };

      const { data, error } = await supabase
        .from("company_ticket_sla_settings")
        .upsert(payload, { onConflict: "company_id" })
        .select("urgent_hours, high_hours, normal_hours, low_hours, warning_hours")
        .single();
      if (error) throw new Error(error.message);
      return normalizeTicketSlaSettings(data ?? DEFAULT_TICKET_SLA_SETTINGS);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ticketSlaSettingsKey(companyId) });
    },
  });
}
