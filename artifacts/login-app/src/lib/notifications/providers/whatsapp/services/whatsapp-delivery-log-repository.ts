import type { SupabaseClient } from "@supabase/supabase-js";
import type { WhatsAppDeliveryResult } from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

export type WhatsAppDeliveryLogRow = {
  created_at: string;
  status: "completed" | "failed" | string;
  last_error: string | null;
};

/**
 * Delivery-only summary derived from `whatsapp_delivery_logs`.
 * This is NOT credential/auth health — do not treat `lastDeliveryError` as
 * the current authentication error (use `company_whatsapp_settings.last_auth_error`).
 */
export type WhatsAppDeliverySummary = {
  lastDeliveryAt: string | null;
  lastDeliveryStatus: "completed" | "failed" | null;
  /** Error from the latest delivery attempt when that attempt failed; audit/history only. */
  lastDeliveryError: string | null;
  recentFailureCount: number;
};

export function mapWhatsAppDeliveryLogRowsToSummary(
  rows: WhatsAppDeliveryLogRow[],
): WhatsAppDeliverySummary {
  const last = rows[0] ?? null;
  const lastDeliveryStatus =
    last?.status === "completed" || last?.status === "failed" ? last.status : null;
  const recentFailureCount = rows.filter((row) => row.status === "failed").length;

  return {
    lastDeliveryAt: last?.created_at ?? null,
    lastDeliveryStatus,
    lastDeliveryError:
      lastDeliveryStatus === "failed" ? (last?.last_error ?? null) : null,
    recentFailureCount,
  };
}

/**
 * Settings-page authentication error source of truth.
 * Never uses delivery-log history — only credential lifecycle / live probe results.
 */
export function resolveWhatsAppSettingsAuthError(input: {
  settingsLastAuthError?: string | null;
  latestConnectionTest?: { ok: boolean; error: string | null } | null;
  healthOk?: boolean | null;
  healthError?: string | null;
}): string | null {
  if (input.latestConnectionTest?.ok === true) {
    return null;
  }
  if (input.latestConnectionTest && input.latestConnectionTest.ok === false) {
    const fromTest = input.latestConnectionTest.error?.trim();
    if (fromTest) return fromTest;
  }
  if (input.healthOk === false) {
    const fromHealth = input.healthError?.trim();
    if (fromHealth) return fromHealth;
  }
  const fromSettings = input.settingsLastAuthError?.trim();
  return fromSettings || null;
}

export class WhatsAppDeliveryLogRepository {
  constructor(private readonly client: SupabaseClient) {}

  async append(result: WhatsAppDeliveryResult): Promise<void> {
    const { error } = await this.client.from("whatsapp_delivery_logs").insert({
      company_id: result.companyId,
      queue_id: result.queueId,
      notification_id: result.notificationId,
      provider: result.provider,
      status: result.status,
      duration_ms: result.durationMs,
      attempts: result.attempts,
      last_error: result.lastError,
      recipient_phone: result.recipientPhone,
      message_id: result.messageId,
      template_key: result.templateKey,
    });
    if (error) throw new Error(error.message);
  }

  /** Delivery audit summary — not credential/authentication health. */
  async latestDeliverySummary(companyId: string): Promise<WhatsAppDeliverySummary> {
    const { data, error } = await this.client
      .from("whatsapp_delivery_logs")
      .select("created_at, status, last_error")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);
    return mapWhatsAppDeliveryLogRowsToSummary((data ?? []) as WhatsAppDeliveryLogRow[]);
  }
}
