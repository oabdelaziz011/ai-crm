import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { usePermissions } from "@/hooks/use-rbac";
import { canManageEmailConnection } from "@/lib/email-workspace/email-tab-permissions";
import { useCompanyChannelsAdmin } from "@/hooks/channels/use-company-channels-admin";
import { pickCompanyEmailChannel } from "@/lib/email-workspace/email-compose-new";
import { ensureEmailProviderServices } from "@/lib/notifications/providers/email";
import {
  fetchEmailChannelOutboundHealth,
  fetchEmailHealth,
  fetchEmailWorkspaceChannel,
  isEmailApiConfigured,
  pollEmailInbox,
  processEmailQueue,
  testEmailConnection,
} from "@/lib/notifications/providers/email/services/email-api-client";
import type { EmailSettingsDraft } from "@/lib/notifications/providers/email/types/email-types";

function useCanManageEmailConnection() {
  const { isSuperAdmin, hasPermission } = usePermissions();
  return canManageEmailConnection(hasPermission, isSuperAdmin);
}

export const emailSettingsKey = (companyId: string | null) =>
  ["email", "settings", companyId] as const;

export const emailHealthKey = (companyId: string | null) =>
  ["email", "health", companyId] as const;

export const emailChannelHealthKey = (companyId: string | null, companyChannelId: string | null) =>
  ["email", "channel-health", companyId, companyChannelId] as const;

export function useEmailCompanyChannel(companyId: string | null) {
  const { data: channels = [] } = useCompanyChannelsAdmin();

  return useMemo(() => {
    if (!companyId) return null;
    const picked = pickCompanyEmailChannel({ companyId, channels });
    if (!picked) return null;
    return channels.find((channel) => channel.id === picked.id) ?? null;
  }, [channels, companyId]);
}

export function emailWorkspaceChannelQueryKey(companyId: string | null) {
  return ["email", "workspace-channel", companyId] as const;
}

/** Email Workspace channel lookup — requires email.view, not channels.view. */
export function useEmailWorkspaceCompanyChannel(companyId: string | null) {
  const { isSuperAdmin, hasPermission, isLoading, isRefreshing } = usePermissions();
  const canResolve = isSuperAdmin || hasPermission("email.view");
  const rbacReady = !isLoading && !isRefreshing && canResolve;

  return useQuery({
    queryKey: emailWorkspaceChannelQueryKey(companyId),
    enabled: Boolean(companyId && rbacReady && isEmailApiConfigured()),
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const result = await fetchEmailWorkspaceChannel(companyId!);
      return result.channel;
    },
  });
}

export function useEmailSettings(companyId: string | null) {
  const canManage = useCanManageEmailConnection();
  return useQuery({
    queryKey: emailSettingsKey(companyId),
    enabled: Boolean(companyId) && canManage,
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
  const canManage = useCanManageEmailConnection();

  return useQuery({
    queryKey: emailHealthKey(companyId),
    enabled: Boolean(companyId) && canManage && isEmailApiConfigured(),
    staleTime: 30_000,
    queryFn: () => fetchEmailHealth(companyId!),
  });
}

export function useEmailChannelOutboundHealth(
  companyId: string | null,
  companyChannelId: string | null,
) {
  const canManage = useCanManageEmailConnection();

  return useQuery({
    queryKey: emailChannelHealthKey(companyId, companyChannelId),
    enabled:
      Boolean(companyId) &&
      Boolean(companyChannelId) &&
      canManage &&
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
  const canManage = useCanManageEmailConnection();
  return useQuery({
    queryKey: ["email", "delivery-summary", companyId],
    enabled: Boolean(companyId) && canManage,
    queryFn: async () => {
      const { deliveryLog } = await ensureEmailProviderServices();
      return deliveryLog.latestHealthSummary(companyId!);
    },
  });
}
