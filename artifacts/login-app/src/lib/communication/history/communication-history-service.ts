import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CommunicationCenterStats,
  CommunicationHistoryEntry,
  CommunicationHistoryFilter,
} from "@/lib/communication/types";
import { CommunicationQueueRepository } from "@/lib/communication/queue/communication-queue-engine";

export class CommunicationHistoryService {
  private readonly queueRepo: CommunicationQueueRepository;

  constructor(client: SupabaseClient) {
    this.queueRepo = new CommunicationQueueRepository(client);
  }

  async list(companyId: string, filter?: CommunicationHistoryFilter): Promise<CommunicationHistoryEntry[]> {
    const items = await this.queueRepo.listByCompany(companyId, undefined, 200);
    return items
      .filter((item) => this.matchesFilter(item, filter))
      .map((item) => ({
        id: item.id,
        companyId: item.companyId,
        channel: item.channel,
        recipient: item.recipient ?? "—",
        templateKey: item.templateKey ?? "—",
        status: item.status,
        provider: item.provider,
        deliveryTime: item.processedAt,
        retryCount: item.retryCount,
        failureReason: item.lastError,
        createdAt: item.createdAt,
      }));
  }

  async stats(companyId: string): Promise<CommunicationCenterStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const items = await this.queueRepo.listByCompany(companyId, undefined, 500);

    const todayItems = items.filter((i) => new Date(i.createdAt) >= today);

    return {
      sentToday: todayItems.filter((i) => ["sent", "delivered", "processing"].includes(i.status)).length,
      delivered: todayItems.filter((i) => i.status === "delivered").length,
      queued: items.filter((i) => i.status === "queued").length,
      failed: items.filter((i) => i.status === "failed").length,
      retrying: items.filter((i) => i.status === "retrying").length,
    };
  }

  private matchesFilter(
    item: Awaited<ReturnType<CommunicationQueueRepository["listByCompany"]>>[number],
    filter?: CommunicationHistoryFilter,
  ): boolean {
    if (!filter) return true;
    if (filter.channel && item.channel !== filter.channel) return false;
    if (filter.status && item.status !== filter.status) return false;
    if (filter.templateKey && item.templateKey !== filter.templateKey) return false;
    if (filter.search) {
      const hay = `${item.recipient} ${item.templateKey} ${item.lastError ?? ""}`.toLowerCase();
      if (!hay.includes(filter.search.toLowerCase())) return false;
    }
    if (filter.dateFrom && item.createdAt < filter.dateFrom) return false;
    if (filter.dateTo && item.createdAt > filter.dateTo) return false;
    return true;
  }
}
