import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCommunicationPlatform } from "@/lib/communication/services/communication-platform-service";
import {
  communicationHistoryKey,
  communicationQueueKey,
  communicationStatsKey,
} from "@/lib/communication/cache/query-keys";
import { invalidateCommunicationQueries } from "@/lib/communication/cache/invalidate-communication-queries";
import type { CommunicationHistoryFilter } from "@/lib/communication/types";

const platform = getCommunicationPlatform();

export function useCommunicationStats(companyId: string | null) {
  return useQuery({
    queryKey: communicationStatsKey(companyId),
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: () => platform.history.stats(companyId!),
  });
}

export function useCommunicationHistory(companyId: string | null, filter?: CommunicationHistoryFilter) {
  return useQuery({
    queryKey: communicationHistoryKey(companyId, filter as Record<string, unknown>),
    enabled: Boolean(companyId),
    staleTime: 15_000,
    queryFn: () => platform.history.list(companyId!, filter),
  });
}

export function useCommunicationQueue(companyId: string | null) {
  return useQuery({
    queryKey: communicationQueueKey(companyId),
    enabled: Boolean(companyId),
    staleTime: 15_000,
    queryFn: () => platform.queue.list(companyId!),
  });
}

export function useRetryCommunicationMessage(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (queueId: string) => {
      if (!companyId) throw new Error("Company required");
      return platform.queue.retry(companyId, queueId);
    },
    onSuccess: () => invalidateCommunicationQueries(qc, companyId),
  });
}

export function useProcessCommunicationQueue(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channel: "whatsapp" | "email") => {
      if (!companyId) throw new Error("Company required");
      const { processCommunicationQueue } = await import("@/lib/communication/providers/channel-providers");
      const { supabase } = await import("@/lib/supabase");
      return processCommunicationQueue(supabase, companyId, channel);
    },
    onSuccess: () => invalidateCommunicationQueries(qc, companyId),
  });
}
