import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useHasPermission } from "@/hooks/use-rbac";
import { useCompanyChannelsAdmin } from "@/hooks/channels/use-company-channels-admin";
import {
  fetchMessengerOutboundHealth,
  fetchMessengerSettings,
  isMessengerApiConfigured,
  upsertMessengerSettings,
  type MessengerSettingsDraft,
} from "@/lib/channels/messenger-settings";

export const messengerSettingsKey = (companyId: string | null) =>
  ["messenger", "settings", companyId] as const;

export const messengerHealthKey = (companyId: string | null, companyChannelId: string | null) =>
  ["messenger", "health", companyId, companyChannelId] as const;

export function useMessengerCompanyChannel(companyId: string | null) {
  const { data: channels = [] } = useCompanyChannelsAdmin();

  return useMemo(
    () =>
      channels.find(
        (channel) =>
          channel.company_id === companyId &&
          channel.communication_channel?.key === "messenger" &&
          !channel.deleted_at,
      ) ?? null,
    [channels, companyId],
  );
}

export function useMessengerSettings(companyId: string | null) {
  return useQuery({
    queryKey: messengerSettingsKey(companyId),
    enabled: Boolean(companyId),
    queryFn: () => fetchMessengerSettings(companyId!),
  });
}

export function useUpdateMessengerSettings(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: MessengerSettingsDraft) => upsertMessengerSettings(companyId!, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: messengerSettingsKey(companyId) });
    },
  });
}

export function useMessengerOutboundHealth(
  companyId: string | null,
  companyChannelId: string | null,
) {
  const isAdmin = useHasPermission("settings.edit");

  return useQuery({
    queryKey: messengerHealthKey(companyId, companyChannelId),
    enabled:
      Boolean(companyId) &&
      Boolean(companyChannelId) &&
      isAdmin &&
      isMessengerApiConfigured(),
    staleTime: 30_000,
    queryFn: () => fetchMessengerOutboundHealth(companyId!, companyChannelId!),
  });
}

export function useMessengerConnectionTest(companyId: string | null, companyChannelId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => fetchMessengerOutboundHealth(companyId!, companyChannelId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: messengerHealthKey(companyId, companyChannelId) });
    },
  });
}
