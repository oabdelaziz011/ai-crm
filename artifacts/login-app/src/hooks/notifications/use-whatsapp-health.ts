import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHasPermission } from "@/hooks/use-rbac";
import { getWhatsAppProviderServices } from "@/lib/notifications/providers/whatsapp";
import {
  fetchWhatsAppHealth,
  isWhatsAppApiConfigured,
  processWhatsAppQueue,
  sendWhatsAppTestMessage,
  testWhatsAppConnection,
  type WhatsAppHealthResponse,
} from "@/lib/notifications/providers/whatsapp/services/whatsapp-api-client";
import type { WhatsAppSettingsDraft } from "@/lib/notifications/providers/whatsapp/services/whatsapp-settings-repository";
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
    queryFn: (): Promise<CompanyWhatsAppSettings> => settings.getPublic(companyId!),
  });
}

export function useUpdateWhatsAppSettings(companyId: string | null) {
  const qc = useQueryClient();
  const { settings } = getWhatsAppProviderServices();

  return useMutation({
    mutationFn: (input: WhatsAppSettingsDraft) => settings.upsert(companyId!, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: whatsappSettingsKey(companyId) });
      void qc.invalidateQueries({ queryKey: whatsappHealthKey(companyId) });
    },
  });
}

export function useWhatsAppConnectionTest(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => testWhatsAppConnection(companyId!),
    onSuccess: (report) => {
      // Drive Provider Health from the latest Test Connection result only.
      // Do not refetch /whatsapp/health here — that probe also gates on
      // settings.enabled and can rehydrate a stale "provider is disabled" error
      // even when Meta credentials and outbound delivery are healthy.
      qc.setQueryData(whatsappHealthKey(companyId), {
        ok: report.ok,
        provider: "meta_cloud",
        latencyMs: report.latencyMs,
        enabled: report.ok ? true : undefined,
        error: report.ok ? undefined : report.error,
      } satisfies Partial<WhatsAppHealthResponse> &
        Pick<WhatsAppHealthResponse, "ok" | "provider" | "latencyMs">);

      qc.setQueryData<CompanyWhatsAppSettings>(whatsappSettingsKey(companyId), (current) => {
        if (!current) return current;
        if (report.ok) {
          return {
            ...current,
            tokenStatus: report.tokenStatus === "unknown" ? "valid" : report.tokenStatus,
            tokenExpiresAt: report.tokenExpiresAt ?? current.tokenExpiresAt,
            lastAuthError: null,
            lastAuthErrorAt: null,
            lastAuthErrorCode: null,
          };
        }
        return {
          ...current,
          tokenStatus: report.tokenStatus,
          tokenExpiresAt: report.tokenExpiresAt ?? current.tokenExpiresAt,
          lastAuthError: report.error ?? current.lastAuthError,
          lastAuthErrorAt: new Date().toISOString(),
        };
      });

      // Refetch public settings so stored token_status / last_auth_error match DB.
      void qc.invalidateQueries({ queryKey: whatsappSettingsKey(companyId) });
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
    queryFn: (): Promise<WhatsAppHealthResponse> => fetchWhatsAppHealth(companyId!),
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
