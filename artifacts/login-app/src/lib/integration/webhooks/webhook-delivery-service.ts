import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookEventType } from "@/lib/integration/types";
import { computeWebhookSignature } from "@/lib/integration/webhooks/webhook-signature";
import { isReplay } from "@/lib/integration/webhooks/replay-protection";

const RETRY_DELAYS_MS = [60_000, 300_000, 900_000, 3600_000, 7200_000];

/** Webhook delivery queue with retries and dead-letter support. */
export class WebhookDeliveryService {
  constructor(private readonly client: SupabaseClient) {}

  async enqueueForEvent(
    companyId: string,
    eventType: WebhookEventType,
    eventId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { data: subs } = await this.client
      .from("integration_webhook_subscriptions")
      .select("id, endpoint_url, secret_hash, event_types")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .eq("is_paused", false);

    for (const sub of subs ?? []) {
      const types = (sub.event_types as string[]) ?? [];
      if (types.length > 0 && !types.includes(eventType) && !types.includes("*")) continue;
      if (isReplay(eventId, String(sub.id))) continue;

      await this.client.from("integration_webhook_deliveries").upsert(
        {
          company_id: companyId,
          subscription_id: sub.id,
          event_type: eventType,
          event_id: eventId,
          payload,
          status: "pending",
        },
        { onConflict: "subscription_id,event_id", ignoreDuplicates: true },
      );
    }
  }

  async processPending(limit = 20): Promise<number> {
    const { data: pending } = await this.client
      .from("integration_webhook_deliveries")
      .select("*, integration_webhook_subscriptions(endpoint_url, secret_hash)")
      .in("status", ["pending", "failed"])
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .limit(limit);

    let processed = 0;
    for (const delivery of pending ?? []) {
      const sub = delivery.integration_webhook_subscriptions as { endpoint_url?: string; secret_hash?: string } | null;
      if (!sub?.endpoint_url) continue;

      const payloadStr = JSON.stringify(delivery.payload);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = await computeWebhookSignature(sub.secret_hash ?? "", payloadStr, timestamp);

      try {
        const response = await fetch(sub.endpoint_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-ValueOR-Signature": `sha256=${signature}`,
            "X-ValueOR-Timestamp": timestamp,
            "X-ValueOR-Event": String(delivery.event_type),
            "X-ValueOR-Event-Id": String(delivery.event_id),
          },
          body: payloadStr,
          signal: AbortSignal.timeout(10_000),
        });

        if (response.ok) {
          await this.client
            .from("integration_webhook_deliveries")
            .update({
              status: "delivered",
              response_status: response.status,
              delivered_at: new Date().toISOString(),
              attempt_count: Number(delivery.attempt_count ?? 0) + 1,
            })
            .eq("id", delivery.id);
          processed += 1;
        } else {
          await this.markFailed(delivery, response.status, await response.text().catch(() => ""));
        }
      } catch (err) {
        await this.markFailed(delivery, 0, err instanceof Error ? err.message : String(err));
      }
    }
    return processed;
  }

  private async markFailed(
    delivery: Record<string, unknown>,
    status: number,
    body: string,
  ): Promise<void> {
    const attempt = Number(delivery.attempt_count ?? 0) + 1;
    const maxAttempts = Number(delivery.max_attempts ?? 5);
    const isDead = attempt >= maxAttempts;

    await this.client
      .from("integration_webhook_deliveries")
      .update({
        status: isDead ? "dead_letter" : "failed",
        attempt_count: attempt,
        response_status: status || null,
        response_body: body.slice(0, 2000),
        next_retry_at: isDead ? null : new Date(Date.now() + (RETRY_DELAYS_MS[attempt - 1] ?? 7200_000)).toISOString(),
      })
      .eq("id", delivery.id);
  }

  async retryDelivery(companyId: string, deliveryId: string): Promise<void> {
    await this.client
      .from("integration_webhook_deliveries")
      .update({ status: "pending", next_retry_at: null, attempt_count: 0 })
      .eq("id", deliveryId)
      .eq("company_id", companyId);
  }
}
