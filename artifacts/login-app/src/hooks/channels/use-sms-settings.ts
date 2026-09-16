import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useCompanyChannelsAdmin } from "@/hooks/channels/use-company-channels-admin";
import {
  fetchSmsSettings,
  testSmsConnection,
  upsertSmsSettings,
  type SmsSettingsDraft,
} from "@/lib/channels/sms-settings";

export const smsSettingsKey = (companyId: string | null) =>
  ["sms", "settings", companyId] as const;

export function useSmsCompanyChannel(companyId: string | null) {
  const { data: channels = [] } = useCompanyChannelsAdmin();

  return useMemo(
    () =>
      channels.find(
        (channel) =>
          channel.company_id === companyId &&
          channel.communication_channel?.key === "sms" &&
          !channel.deleted_at,
      ) ?? null,
    [channels, companyId],
  );
}

export function useSmsSettings(companyId: string | null) {
  return useQuery({
    queryKey: smsSettingsKey(companyId),
    enabled: Boolean(companyId),
    queryFn: () => fetchSmsSettings(companyId!),
  });
}

export function useUpdateSmsSettings(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: SmsSettingsDraft) => upsertSmsSettings(companyId!, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: smsSettingsKey(companyId) });
    },
  });
}

export function useSmsConnectionTest(companyId: string | null) {
  return useMutation({
    mutationFn: () => testSmsConnection(companyId!),
  });
}
