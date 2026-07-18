import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  AiAssistantSettings,
  AiAssistantSettingsInsert,
  AiAssistantSettingsUpdate,
} from "@/lib/types";

export const AI_ASSISTANT_SETTINGS_KEY = ["ai-assistant-settings"] as const;

export function aiAssistantSettingsQueryKey(companyId: string | null) {
  return [...AI_ASSISTANT_SETTINGS_KEY, companyId] as const;
}

export function useAiAssistantSettings(companyId: string | null) {
  return useQuery({
    queryKey: aiAssistantSettingsQueryKey(companyId),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<AiAssistantSettings | null> => {
      const { data, error } = await supabase
        .from("ai_assistant_settings")
        .select("*")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return (data as AiAssistantSettings | null) ?? null;
    },
  });
}

export function useCreateAiAssistantSettings() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (values: AiAssistantSettingsInsert) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("ai_assistant_settings")
        .insert({
          ...values,
          created_by: user.id,
          updated_by: user.id,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data as AiAssistantSettings;
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: aiAssistantSettingsQueryKey(data.company_id) });
      void qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
  });
}

export function useUpdateAiAssistantSettings() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      companyId,
      values,
    }: {
      id: string;
      companyId: string;
      values: AiAssistantSettingsUpdate;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("ai_assistant_settings")
        .update({
          ...values,
          updated_by: user.id,
        })
        .eq("id", id)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data as AiAssistantSettings;
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: aiAssistantSettingsQueryKey(data.company_id) });
      void qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
  });
}
