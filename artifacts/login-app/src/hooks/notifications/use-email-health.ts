import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useHasPermission } from "@/hooks/use-rbac";
import { getEmailProviderServices } from "@/lib/notifications/providers/email";
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
  const { settings } = getEmailProviderServices();

  return useQuery({
    queryKey: emailSettingsKey(companyId),
    enabled: Boolean(companyId),
    queryFn: () => settings.getPublic(companyId!),
  });
}

export function useUpdateEmailSettings(companyId: string | null) {
  const qc = useQueryClient();
  const { settings } = getEmailProviderServices();

  return useMutation({
    mutationFn: (input: Omit<CompanyEmailSettings, "companyId" | "hasPassword" | "updatedAt">) =>
      settings.upsert(companyId!, input),
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
  const { deliveryLog } = getEmailProviderServices();

  return useQuery({
    queryKey: ["email", "delivery-summary", companyId],
    enabled: Boolean(companyId),
    queryFn: () => deliveryLog.latestHealthSummary(companyId!),
  });
}
