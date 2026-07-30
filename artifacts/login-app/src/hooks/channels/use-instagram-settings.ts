import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useHasPermission } from "@/hooks/use-rbac";
import { useCompanyChannelsAdmin } from "@/hooks/channels/use-company-channels-admin";
import {
  fetchInstagramOutboundHealth,
  fetchInstagramSettings,
  isInstagramApiConfigured,
  upsertInstagramSettings,
  type InstagramSettingsDraft,
} from "@/lib/channels/instagram-settings";

export const instagramSettingsKey = (companyId: string | null) =>
  ["instagram", "settings", companyId] as const;

export const instagramHealthKey = (companyId: string | null, companyChannelId: string | null) =>
  ["instagram", "health", companyId, companyChannelId] as const;

export function useInstagramCompanyChannel(companyId: string | null) {
  const { data: channels = [] } = useCompanyChannelsAdmin();

  return useMemo(
    () =>
      channels.find(
        (channel) =>
          channel.company_id === companyId &&
          channel.communication_channel?.key === "instagram" &&
          !channel.deleted_at,
      ) ?? null,
    [channels, companyId],
  );
}

export function useInstagramSettings(companyId: string | null) {
  return useQuery({
    queryKey: instagramSettingsKey(companyId),
    enabled: Boolean(companyId),
    queryFn: () => fetchInstagramSettings(companyId!),
  });
}

export function useUpdateInstagramSettings(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: InstagramSettingsDraft) => upsertInstagramSettings(companyId!, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: instagramSettingsKey(companyId) });
    },
  });
}

export function useInstagramOutboundHealth(
  companyId: string | null,
  companyChannelId: string | null,
) {
  const isAdmin = useHasPermission("settings.edit");

  return useQuery({
    queryKey: instagramHealthKey(companyId, companyChannelId),
    enabled:
      Boolean(companyId) &&
      Boolean(companyChannelId) &&
      isAdmin &&
      isInstagramApiConfigured(),
    staleTime: 30_000,
    queryFn: () => fetchInstagramOutboundHealth(companyId!, companyChannelId!),
  });
}

export function useInstagramConnectionTest(companyId: string | null, companyChannelId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => fetchInstagramOutboundHealth(companyId!, companyChannelId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: instagramHealthKey(companyId, companyChannelId) });
    },
  });
}
