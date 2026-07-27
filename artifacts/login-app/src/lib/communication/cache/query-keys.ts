export const COMMUNICATION_HISTORY_KEY = ["communication-history"] as const;
export const COMMUNICATION_STATS_KEY = ["communication-stats"] as const;
export const COMMUNICATION_QUEUE_KEY = ["communication-queue"] as const;

export function communicationHistoryKey(companyId: string | null, filter?: Record<string, unknown>) {
  return [...COMMUNICATION_HISTORY_KEY, companyId, filter ?? {}] as const;
}

export function communicationStatsKey(companyId: string | null) {
  return [...COMMUNICATION_STATS_KEY, companyId] as const;
}

export function communicationQueueKey(companyId: string | null) {
  return [...COMMUNICATION_QUEUE_KEY, companyId] as const;
}
