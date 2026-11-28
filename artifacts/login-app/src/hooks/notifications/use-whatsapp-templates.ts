import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchWhatsAppCompanyTemplates,
  isWhatsAppApiConfigured,
  provisionWhatsAppCompanyTemplates,
  syncWhatsAppCompanyTemplates,
  type WhatsAppTemplatesListResponse,
  type WhatsAppTemplatesProvisionResponse,
  type WhatsAppTemplatesSyncResponse,
} from "@/lib/notifications/providers/whatsapp/services/whatsapp-api-client";
import { computeWhatsAppTemplateSetupReadiness } from "@/lib/notifications/providers/whatsapp/services/whatsapp-template-readiness";

export const whatsappTemplatesKey = (companyId: string | null) =>
  ["whatsapp", "templates", companyId] as const;

export function useWhatsAppCompanyTemplates(
  companyId: string | null,
  options?: { enabled?: boolean },
) {
  const enabled =
    Boolean(companyId) &&
    Boolean(options?.enabled ?? true) &&
    isWhatsAppApiConfigured();

  return useQuery({
    queryKey: whatsappTemplatesKey(companyId),
    enabled,
    staleTime: 30_000,
    retry: 1,
    queryFn: (): Promise<WhatsAppTemplatesListResponse> =>
      fetchWhatsAppCompanyTemplates(companyId!),
  });
}

export function useWhatsAppTemplateReadiness(
  companyId: string | null,
  options?: { enabled?: boolean },
) {
  const query = useWhatsAppCompanyTemplates(companyId, options);
  const readiness =
    query.data?.readiness ??
    computeWhatsAppTemplateSetupReadiness(query.data?.templates, {
      setupPending: query.data?.setupPending === true,
    });
  return { ...query, readiness };
}

export function useSyncWhatsAppCompanyTemplates(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (): Promise<WhatsAppTemplatesSyncResponse> =>
      syncWhatsAppCompanyTemplates(companyId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: whatsappTemplatesKey(companyId) });
    },
  });
}

export function useProvisionWhatsAppCompanyTemplates(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input?: {
      purposes?: string[];
    }): Promise<WhatsAppTemplatesProvisionResponse> =>
      provisionWhatsAppCompanyTemplates(companyId!, {
        purposes: input?.purposes,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: whatsappTemplatesKey(companyId) });
    },
  });
}
