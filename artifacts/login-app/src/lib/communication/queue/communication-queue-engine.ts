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
    return (data ?? []).map((row) => this.mapRow(row as QueueDbRow));
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

  private mapRow(row: NotificationQueueItem | QueueDbRow): CommunicationQueueItem {
    const normalized = normalizeQueueRow(row);
    const payload = normalized.payload;
    const params =
      payload.params && typeof payload.params === "object" && !Array.isArray(payload.params)
        ? (payload.params as Record<string, unknown>)
        : {};

    const eventOrTemplate = String(
      payload.templateKey ?? payload.template_key ?? payload.event ?? "",
    ).trim();
    const recipientCandidate = String(
      payload.recipient ??
        params.email ??
        params.phone ??
        params.to ??
        payload.phone ??
        payload.email ??
        "",
    ).trim();
    const recipient =
      recipientCandidate && recipientCandidate !== eventOrTemplate ? recipientCandidate : "";

    const cancelled = normalized.lastError === "cancelled";
    const status = cancelled
      ? "cancelled"
      : mapDbStatusToCommunication(
          normalized.status as NotificationQueueItem["status"],
          normalized.retryCount,
        );

    return {
      id: normalized.id,
      companyId: normalized.companyId,
      notificationId: normalized.notificationId,
      channel: normalized.channel as CommunicationQueueItem["channel"],
      status,
      retryCount: normalized.retryCount,
      scheduledAt: normalized.scheduledAt,
      processedAt: normalized.processedAt,
      lastError: normalized.lastError,
      templateKey: eventOrTemplate,
      recipient,
      provider: String(payload.provider ?? normalized.channel),
      payload,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
    };
  }
}

/** Raw Supabase row (snake_case) or already-mapped NotificationQueueItem. */
type QueueDbRow = {
  id: string;
  company_id?: string;
  companyId?: string;
  notification_id?: string | null;
  notificationId?: string | null;
  channel: string;
  status: string;
  retry_count?: number;
  retryCount?: number;
  scheduled_at?: string;
  scheduledAt?: string;
  processed_at?: string | null;
  processedAt?: string | null;
  last_error?: string | null;
  lastError?: string | null;
  payload?: Record<string, unknown> | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
};

function normalizeQueueRow(row: NotificationQueueItem | QueueDbRow) {
  const raw = row as QueueDbRow;
  return {
    id: raw.id,
    companyId: String(raw.companyId ?? raw.company_id ?? ""),
    notificationId: (raw.notificationId ?? raw.notification_id ?? null) as string | null,
    channel: raw.channel,
    status: raw.status,
    retryCount: Number(raw.retryCount ?? raw.retry_count ?? 0),
    scheduledAt: String(raw.scheduledAt ?? raw.scheduled_at ?? ""),
    processedAt: (raw.processedAt ?? raw.processed_at ?? null) as string | null,
    lastError: (raw.lastError ?? raw.last_error ?? null) as string | null,
    payload: (raw.payload ?? {}) as Record<string, unknown>,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ""),
  };
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
