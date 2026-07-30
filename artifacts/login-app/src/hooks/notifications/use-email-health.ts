import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useHasPermission } from "@/hooks/use-rbac";
import { useCompanyChannelsAdmin } from "@/hooks/channels/use-company-channels-admin";
import { ensureEmailProviderServices } from "@/lib/notifications/providers/email";
import {
  fetchEmailChannelOutboundHealth,
  fetchEmailHealth,
  isEmailApiConfigured,
  pollEmailInbox,
  processEmailQueue,
  testEmailConnection,
} from "@/lib/notifications/providers/email/services/email-api-client";
import type { EmailSettingsDraft } from "@/lib/notifications/providers/email/types/email-types";

export const emailSettingsKey = (companyId: string | null) =>
  ["email", "settings", companyId] as const;

export const emailHealthKey = (companyId: string | null) =>
  ["email", "health", companyId] as const;

export const emailChannelHealthKey = (companyId: string | null, companyChannelId: string | null) =>
  ["email", "channel-health", companyId, companyChannelId] as const;

export function useEmailCompanyChannel(companyId: string | null) {
  const { data: channels = [] } = useCompanyChannelsAdmin();

  return useMemo(
    () =>
      channels.find(
        (channel) =>
          channel.company_id === companyId &&
          channel.communication_channel?.key === "email" &&
          !channel.deleted_at,
      ) ?? null,
    [channels, companyId],
  );
}

export function useEmailSettings(companyId: string | null) {
  return useQuery({
    queryKey: emailSettingsKey(companyId),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { settings } = await ensureEmailProviderServices();
      return settings.getPublic(companyId!);
    },
  });
}

export function useUpdateEmailSettings(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (changes: Partial<EmailSettingsDraft>) => {
      const { settings } = await ensureEmailProviderServices();
      return settings.upsert(companyId!, changes);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: emailSettingsKey(companyId) });
      void qc.invalidateQueries({ queryKey: emailHealthKey(companyId) });
      void qc.invalidateQueries({ queryKey: ["email", "channel-health", companyId] });
    },
  });
}

/** Admin-only notification provider health probe (server-side SMTP verify). */
export function useEmailHealth(companyId: string | null) {
  const isAdmin = useHasPermission("settings.edit");

  return useQuery({
    queryKey: emailHealthKey(companyId),
    enabled: Boolean(companyId) && isAdmin && isEmailApiConfigured(),
    staleTime: 30_000,
    queryFn: () => fetchEmailHealth(companyId!),
  });
}

export function useEmailChannelOutboundHealth(
  companyId: string | null,
  companyChannelId: string | null,
) {
  const isAdmin = useHasPermission("settings.edit");

  return useQuery({
    queryKey: emailChannelHealthKey(companyId, companyChannelId),
    enabled:
      Boolean(companyId) &&
      Boolean(companyChannelId) &&
      isAdmin &&
      isEmailApiConfigured(),
    staleTime: 30_000,
    queryFn: () => fetchEmailChannelOutboundHealth(companyId!, companyChannelId!),
  });
}

export function useEmailChannelConnectionTest(companyId: string | null, companyChannelId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => fetchEmailChannelOutboundHealth(companyId!, companyChannelId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: emailChannelHealthKey(companyId, companyChannelId) });
    },
  });
}

export function useEmailPollInbox(companyId: string | null, companyChannelId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => pollEmailInbox(companyId!, companyChannelId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: emailSettingsKey(companyId) });
    },
  });
}

export function useEmailConnectionTest(companyId: string | null) {
  return useMutation({
    mutationFn: (recipientEmail: string) => testEmailConnection(companyId!, recipientEmail),
  });
}

export function useProcessEmailQueue(companyId: string | null) {
  return useMutation({
    mutationFn: () => processEmailQueue(companyId!),
  });
}

export function useEmailDeliverySummary(companyId: string | null) {
  return useQuery({
    queryKey: ["email", "delivery-summary", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { deliveryLog } = await ensureEmailProviderServices();
      return deliveryLog.latestHealthSummary(companyId!);
    },
  });
}
