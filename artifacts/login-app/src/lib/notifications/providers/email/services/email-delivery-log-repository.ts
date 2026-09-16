import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailDeliveryResult } from "../types/email-types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * email_delivery_logs.queue_id / notification_id are UUID FKs.
 * Test/direct/template-test sends use synthetic ids ("test", "direct", "template-test:…")
 * which must be stored as NULL — never as invalid uuid text (that 500s after SMTP success).
 */
export function resolveEmailDeliveryLogForeignKey(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed === "test" || trimmed === "direct") return null;
  if (trimmed.startsWith("template-test:")) return null;
  return UUID_RE.test(trimmed) ? trimmed : null;
}

export class EmailDeliveryLogRepository {
  constructor(private readonly client: SupabaseClient) {}

  async append(result: EmailDeliveryResult): Promise<void> {
    const { error } = await this.client.from("email_delivery_logs").insert({
      company_id: result.companyId,
      queue_id: resolveEmailDeliveryLogForeignKey(result.queueId),
      notification_id: resolveEmailDeliveryLogForeignKey(result.notificationId),
      provider: result.provider,
      status: result.status,
      duration_ms: result.durationMs,
      attempts: result.attempts,
      last_error: result.lastError,
      recipient_email: result.recipientEmail,
      subject: result.subject,
    });
    if (error) throw new Error(error.message);
  }

  async latestHealthSummary(companyId: string): Promise<{
    lastDeliveryAt: string | null;
    lastError: string | null;
    recentFailureCount: number;
  }> {
    const { data, error } = await this.client
      .from("email_delivery_logs")
      .select("created_at, status, last_error")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const last = rows[0] ?? null;
    const recentFailureCount = rows.filter((row) => row.status === "failed").length;
    return {
      lastDeliveryAt: last?.created_at ?? null,
      lastError: last?.status === "failed" ? (last.last_error as string | null) : null,
      recentFailureCount,
    };
  }
}
