import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHasPermission } from "@/hooks/use-rbac";
import { getWhatsAppProviderServices } from "@/lib/notifications/providers/whatsapp";
import {
  fetchWhatsAppHealth,
  isWhatsAppApiConfigured,
  processWhatsAppQueue,
  sendWhatsAppTestMessage,
} from "@/lib/notifications/providers/whatsapp/services/whatsapp-api-client";
import type { CompanyWhatsAppSettings } from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

export const whatsappSettingsKey = (companyId: string | null) =>
  ["whatsapp", "settings", companyId] as const;

export const whatsappHealthKey = (companyId: string | null) =>
  ["whatsapp", "health", companyId] as const;

export function useWhatsAppSettings(companyId: string | null) {
  const { settings } = getWhatsAppProviderServices();

  return useQuery({
    queryKey: whatsappSettingsKey(companyId),
    enabled: Boolean(companyId),
    queryFn: () => settings.getPublic(companyId!),
  });
}

export function useUpdateWhatsAppSettings(companyId: string | null) {
  const qc = useQueryClient();
  const { settings } = getWhatsAppProviderServices();

  return useMutation({
    mutationFn: (
      input: Omit<
        CompanyWhatsAppSettings,
        "companyId" | "hasAccessToken" | "hasWebhookVerifyToken" | "updatedAt"
      >,
    ) => settings.upsert(companyId!, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: whatsappSettingsKey(companyId) });
      void qc.invalidateQueries({ queryKey: whatsappHealthKey(companyId) });
    },
  });
}

/** Admin-only provider health probe (server-side Meta API verify). */
export function useWhatsAppHealth(companyId: string | null) {
  const isAdmin = useHasPermission("settings.edit");

  return useQuery({
    queryKey: whatsappHealthKey(companyId),
    enabled: Boolean(companyId) && isAdmin && isWhatsAppApiConfigured(),
    staleTime: 30_000,
    queryFn: () => fetchWhatsAppHealth(companyId!),
  });
}

export function useWhatsAppTestMessage(companyId: string | null) {
  return useMutation({
    mutationFn: (recipientPhone: string) => sendWhatsAppTestMessage(companyId!, recipientPhone),
  });
}

export function useProcessWhatsAppQueue(companyId: string | null) {
  return useMutation({
    mutationFn: () => processWhatsAppQueue(companyId!),
  });
}

export function useWhatsAppDeliverySummary(companyId: string | null) {
  const { deliveryLog } = getWhatsAppProviderServices();

  return useQuery({
    queryKey: ["whatsapp", "delivery-summary", companyId],
    enabled: Boolean(companyId),
    queryFn: () => deliveryLog.latestHealthSummary(companyId!),
  });
}
