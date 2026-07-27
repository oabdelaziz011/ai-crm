import type { QueryClient } from "@tanstack/react-query";
import {
  communicationHistoryKey,
  communicationQueueKey,
  communicationStatsKey,
} from "@/lib/communication/cache/query-keys";

export function invalidateCommunicationQueries(qc: QueryClient, companyId: string | null): void {
  void qc.invalidateQueries({ queryKey: communicationHistoryKey(companyId) });
  void qc.invalidateQueries({ queryKey: communicationStatsKey(companyId) });
  void qc.invalidateQueries({ queryKey: communicationQueueKey(companyId) });
}
