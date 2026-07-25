import {
  DEFAULT_WHATSAPP_MAX_RETRY,
  WHATSAPP_RETRY_BACKOFF_MS,
} from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

export type WhatsAppRetryDecision = {
  shouldRetry: boolean;
  nextAttempt: number;
  delayMs: number;
};

export class WhatsAppRetryPolicy {
  constructor(private readonly maxRetryCount: number = DEFAULT_WHATSAPP_MAX_RETRY) {}

  evaluate(currentRetryCount: number): WhatsAppRetryDecision {
    const nextAttempt = currentRetryCount + 1;
    if (nextAttempt > this.maxRetryCount) {
      return { shouldRetry: false, nextAttempt, delayMs: 0 };
    }
    const delayMs =
      WHATSAPP_RETRY_BACKOFF_MS[Math.min(nextAttempt, WHATSAPP_RETRY_BACKOFF_MS.length - 1)] ?? 0;
    return { shouldRetry: true, nextAttempt, delayMs };
  }
}

export function whatsAppQueueStatusAfterFailure(
  decision: WhatsAppRetryDecision,
): "pending" | "failed" {
  return decision.shouldRetry ? "pending" : "failed";
}
