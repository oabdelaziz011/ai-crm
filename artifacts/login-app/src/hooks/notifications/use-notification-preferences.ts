import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNotificationServices,
  invalidateNotificationQueries,
  notificationPreferencesKey,
} from "@/lib/notifications";
import type { NotificationPreference } from "@/lib/notifications/types";
import { useAuth } from "@/context/auth-context";

export function useNotificationPreferences(companyId: string | null) {
  const { user } = useAuth();
  const { preferenceService } = getNotificationServices();

  return useQuery({
    queryKey: notificationPreferencesKey(companyId, user?.id ?? null),
    enabled: Boolean(companyId),
    queryFn: () => preferenceService.list(companyId!, user?.id ?? null),
  });
}

export function useUpdateNotificationPreference(companyId: string | null) {
  const qc = useQueryClient();
  const { preferenceRepository } = getNotificationServices();

  return useMutation({
    mutationFn: async (
      preference: Omit<NotificationPreference, "id" | "createdAt" | "updatedAt">,
    ) => preferenceRepository.upsert(preference),
    onSuccess: () => {
      invalidateNotificationQueries(qc, companyId);
    },
  });
}
