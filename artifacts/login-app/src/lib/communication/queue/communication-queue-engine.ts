import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationQueueItem } from "@/lib/notifications/types";
import type { CommunicationQueueItem, CommunicationQueueStatus } from "@/lib/communication/types";
import { mapDbStatusToCommunication } from "@/lib/communication/utilities/queue-status-mapper";
import { computeExponentialBackoffMs, shouldRetry } from "@/lib/communication/utilities/retry-policy";

const DEFAULT_MAX_RETRIES = 5;

export class CommunicationQueueRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByCompany(
    companyId: string,
    statuses?: CommunicationQueueStatus[],
    limit = 100,
  ): Promise<CommunicationQueueItem[]> {
    const dbStatuses = statuses?.length
      ? [...new Set(statuses.map((s) => this.toDbFilter(s)).flat())]
      : ["pending", "processing", "completed", "failed"];

    const { data, error } = await this.client
      .from("notification_queue")
      .select("*")
      .eq("company_id", companyId)
      .in("status", dbStatuses)
      .order("scheduled_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.mapRow(row as NotificationQueueItem & { payload: Record<string, unknown> }));
  }

  async retry(companyId: string, queueId: string): Promise<void> {
    const { error } = await this.client
      .from("notification_queue")
      .update({
        status: "pending",
        scheduled_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("id", queueId);

    if (error) throw new Error(error.message);
  }

  async cancel(companyId: string, queueId: string): Promise<void> {
    const { error } = await this.client
      .from("notification_queue")
      .update({
        status: "failed",
        last_error: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("id", queueId);

    if (error) throw new Error(error.message);
  }

  async scheduleRetry(
    companyId: string,
    queueId: string,
    retryCount: number,
    maxRetries = DEFAULT_MAX_RETRIES,
  ): Promise<boolean> {
    if (!shouldRetry(retryCount, maxRetries)) return false;
    const delayMs = computeExponentialBackoffMs(retryCount);
    const { error } = await this.client
      .from("notification_queue")
      .update({
        status: "pending",
        retry_count: retryCount + 1,
        scheduled_at: new Date(Date.now() + delayMs).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("id", queueId);

    if (error) throw new Error(error.message);
    return true;
  }

  private toDbFilter(status: CommunicationQueueStatus): string[] {
    switch (status) {
      case "queued":
        return ["pending"];
      case "processing":
        return ["processing"];
      case "sent":
      case "delivered":
        return ["completed"];
      case "failed":
      case "retrying":
      case "cancelled":
        return ["failed"];
      default:
        return ["pending"];
    }
  }

  private mapRow(row: NotificationQueueItem & { payload: Record<string, unknown> }): CommunicationQueueItem {
    const cancelled = row.lastError === "cancelled";
    const status = cancelled
      ? "cancelled"
      : mapDbStatusToCommunication(row.status, row.retryCount);

    return {
      id: row.id,
      companyId: row.companyId,
      notificationId: row.notificationId,
      channel: row.channel as CommunicationQueueItem["channel"],
      status,
      retryCount: row.retryCount,
      scheduledAt: row.scheduledAt,
      processedAt: row.processedAt,
      lastError: row.lastError,
      templateKey: String(row.payload.templateKey ?? row.payload.event ?? ""),
      recipient: String(row.payload.recipient ?? row.payload.phone ?? row.payload.email ?? ""),
      provider: String(row.payload.provider ?? row.channel),
      payload: row.payload ?? {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

/** Queue engine with retry and dead-letter semantics over notification_queue. */
export class CommunicationQueueEngine {
  constructor(private readonly repository: CommunicationQueueRepository) {}

  list(companyId: string, statuses?: CommunicationQueueStatus[]): Promise<CommunicationQueueItem[]> {
    return this.repository.listByCompany(companyId, statuses);
  }

  retry(companyId: string, queueId: string): Promise<void> {
    return this.repository.retry(companyId, queueId);
  }

  cancel(companyId: string, queueId: string): Promise<void> {
    return this.repository.cancel(companyId, queueId);
  }

  async handleFailure(
    companyId: string,
    queueId: string,
    retryCount: number,
    maxRetries = DEFAULT_MAX_RETRIES,
  ): Promise<"retrying" | "dead_letter"> {
    const scheduled = await this.repository.scheduleRetry(companyId, queueId, retryCount, maxRetries);
    return scheduled ? "retrying" : "dead_letter";
  }
}
