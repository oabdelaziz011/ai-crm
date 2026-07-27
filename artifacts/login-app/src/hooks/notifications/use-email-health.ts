import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useHasPermission } from "@/hooks/use-rbac";
import { ensureEmailProviderServices } from "@/lib/notifications/providers/email";
import {
  fetchEmailHealth,
  isEmailApiConfigured,
  processEmailQueue,
  testEmailConnection,
} from "@/lib/notifications/providers/email/services/email-api-client";
import type { CompanyEmailSettings } from "@/lib/notifications/providers/email/types/email-types";

export const emailSettingsKey = (companyId: string | null) =>
  ["email", "settings", companyId] as const;

export const emailHealthKey = (companyId: string | null) =>
  ["email", "health", companyId] as const;

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
    mutationFn: async (input: Omit<CompanyEmailSettings, "companyId" | "hasPassword" | "updatedAt">) => {
      const { settings } = await ensureEmailProviderServices();
      return settings.upsert(companyId!, input);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: emailSettingsKey(companyId) });
      void qc.invalidateQueries({ queryKey: emailHealthKey(companyId) });
    },
  });
}

/** Admin-only provider health probe (server-side SMTP verify). */
export function useEmailHealth(companyId: string | null) {
  const isAdmin = useHasPermission("settings.edit");

  return useQuery({
    queryKey: emailHealthKey(companyId),
    enabled: Boolean(companyId) && isAdmin && isEmailApiConfigured(),
    staleTime: 30_000,
    queryFn: () => fetchEmailHealth(companyId!),
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
