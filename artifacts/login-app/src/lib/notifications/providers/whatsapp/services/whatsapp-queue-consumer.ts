import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationQueueItem } from "@/lib/notifications/types";

type QueueRow = {
  id: string;
  company_id: string;
  notification_id: string | null;
  channel: string;
  status: string;
  retry_count: number;
  scheduled_at: string;
  processed_at: string | null;
  last_error: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function mapRow(row: QueueRow): NotificationQueueItem {
  return {
    id: row.id,
    companyId: row.company_id,
    notificationId: row.notification_id,
    channel: row.channel as NotificationQueueItem["channel"],
    status: row.status as NotificationQueueItem["status"],
    retryCount: row.retry_count,
    scheduledAt: row.scheduled_at,
    processedAt: row.processed_at,
    lastError: row.last_error,
    payload: row.payload ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Reads/writes notification_queue for whatsapp channel only. */
export class WhatsAppQueueConsumer {
  constructor(private readonly client: SupabaseClient) {}

  async listPendingWhatsApp(companyId: string, limit = 25): Promise<NotificationQueueItem[]> {
    const { data, error } = await this.client
      .from("notification_queue")
      .select("*")
      .eq("company_id", companyId)
      .eq("channel", "whatsapp")
      .in("status", ["pending", "failed"])
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapRow(row as QueueRow));
  }

  async markProcessing(companyId: string, queueId: string): Promise<void> {
    await this.updateStatus(companyId, queueId, "processing");
  }

  async markCompleted(companyId: string, queueId: string): Promise<void> {
    await this.updateStatus(companyId, queueId, "completed", {
      processedAt: new Date().toISOString(),
      lastError: null,
    });
  }

  async markFailed(
    companyId: string,
    queueId: string,
    errorMessage: string,
    retryCount: number,
    rescheduleAt?: string,
  ): Promise<void> {
    const update: Record<string, unknown> = {
      status: "failed",
      retry_count: retryCount,
      last_error: errorMessage,
      updated_at: new Date().toISOString(),
    };
    if (rescheduleAt) {
      update.status = "pending";
      update.scheduled_at = rescheduleAt;
    }

    const { error } = await this.client
      .from("notification_queue")
      .update(update)
      .eq("company_id", companyId)
      .eq("id", queueId);

    if (error) throw new Error(error.message);
  }

  private async updateStatus(
    companyId: string,
    queueId: string,
    status: string,
    patch: Partial<{ retryCount: number; lastError: string | null; processedAt: string | null }> = {},
  ): Promise<void> {
    const update: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (patch.retryCount != null) update.retry_count = patch.retryCount;
    if (patch.lastError !== undefined) update.last_error = patch.lastError;
    if (patch.processedAt !== undefined) update.processed_at = patch.processedAt;

    const { error } = await this.client
      .from("notification_queue")
      .update(update)
      .eq("company_id", companyId)
      .eq("id", queueId);

    if (error) throw new Error(error.message);
  }
}
