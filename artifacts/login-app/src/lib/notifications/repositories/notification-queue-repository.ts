import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NotificationChannel,
  NotificationQueueItem,
  NotificationQueueStatus,
} from "@/lib/notifications/types";

type QueueRow = {
  id: string;
  company_id: string;
  notification_id: string | null;
  channel: NotificationChannel;
  status: NotificationQueueStatus;
  retry_count: number;
  scheduled_at: string;
  processed_at: string | null;
  last_error: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function mapQueueRow(row: QueueRow): NotificationQueueItem {
  return {
    id: row.id,
    companyId: row.company_id,
    notificationId: row.notification_id,
    channel: row.channel,
    status: row.status,
    retryCount: row.retry_count,
    scheduledAt: row.scheduled_at,
    processedAt: row.processed_at,
    lastError: row.last_error,
    payload: row.payload ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type EnqueueInput = {
  companyId: string;
  notificationId: string | null;
  channel: NotificationChannel;
  scheduledAt?: string;
  payload?: Record<string, unknown>;
};

export class NotificationQueueRepository {
  constructor(private readonly client: SupabaseClient) {}

  async enqueue(input: EnqueueInput): Promise<NotificationQueueItem> {
    const { data, error } = await this.client
      .from("notification_queue")
      .insert({
        company_id: input.companyId,
        notification_id: input.notificationId,
        channel: input.channel,
        status: "pending",
        retry_count: 0,
        scheduled_at: input.scheduledAt ?? new Date().toISOString(),
        payload: input.payload ?? {},
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return mapQueueRow(data as QueueRow);
  }

  async listPending(companyId: string, limit = 50): Promise<NotificationQueueItem[]> {
    const { data, error } = await this.client
      .from("notification_queue")
      .select("*")
      .eq("company_id", companyId)
      .in("status", ["pending", "failed"])
      .order("scheduled_at", { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapQueueRow(row as QueueRow));
  }

  async updateStatus(
    companyId: string,
    id: string,
    status: NotificationQueueStatus,
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
      .eq("id", id);

    if (error) throw new Error(error.message);
  }
}
