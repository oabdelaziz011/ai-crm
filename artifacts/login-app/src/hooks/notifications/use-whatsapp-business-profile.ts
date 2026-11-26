import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchWhatsAppBusinessProfile,
  isWhatsAppBusinessProfileApiConfigured,
  syncWhatsAppBusinessProfile,
  updateWhatsAppBusinessProfileFields,
  uploadWhatsAppBusinessProfilePicture,
  type WhatsAppBusinessProfile,
  type WhatsAppBusinessProfileUpdateInput,
} from "@/lib/channels/whatsapp-business-profile-client";

export const whatsappBusinessProfileKey = (companyId: string | null) =>
  ["whatsapp", "business-profile", companyId] as const;

export function useWhatsAppBusinessProfile(
  companyId: string | null,
  options?: { enabled?: boolean },
) {
  const enabled =
    Boolean(companyId) &&
    Boolean(options?.enabled ?? true) &&
    isWhatsAppBusinessProfileApiConfigured();

  return useQuery({
    queryKey: whatsappBusinessProfileKey(companyId),
    enabled,
    staleTime: 30_000,
    retry: 1,
    queryFn: (): Promise<WhatsAppBusinessProfile> =>
      fetchWhatsAppBusinessProfile(companyId!),
  });
}

export function useSyncWhatsAppBusinessProfile(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (): Promise<WhatsAppBusinessProfile> =>
      syncWhatsAppBusinessProfile(companyId!),
    onSuccess: (profile) => {
      qc.setQueryData(whatsappBusinessProfileKey(companyId), profile);
    },
  });
}

export function useUpdateWhatsAppBusinessProfile(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (
      input: WhatsAppBusinessProfileUpdateInput,
    ): Promise<WhatsAppBusinessProfile> =>
      updateWhatsAppBusinessProfileFields(companyId!, input),
    onSuccess: (profile) => {
      qc.setQueryData(whatsappBusinessProfileKey(companyId), profile);
    },
  });
}

export function useUploadWhatsAppBusinessProfilePicture(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      mimeType: string;
      imageBase64: string;
      fileName?: string;
    }): Promise<WhatsAppBusinessProfile> =>
      uploadWhatsAppBusinessProfilePicture({
        companyId: companyId!,
        mimeType: input.mimeType,
        imageBase64: input.imageBase64,
        fileName: input.fileName,
      }),
    onSuccess: (profile) => {
      qc.setQueryData(whatsappBusinessProfileKey(companyId), profile);
    },
  });
}
