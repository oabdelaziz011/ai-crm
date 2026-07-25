import {
  DEFAULT_MAX_RETRY_COUNT,
  EMAIL_RETRY_BACKOFF_MS,
} from "@/lib/notifications/providers/email/types/email-types";

export type RetryDecision = {
  shouldRetry: boolean;
  nextAttempt: number;
  delayMs: number;
};

export class EmailRetryPolicy {
  constructor(private readonly maxRetryCount: number = DEFAULT_MAX_RETRY_COUNT) {}

  evaluate(currentRetryCount: number): RetryDecision {
    const nextAttempt = currentRetryCount + 1;
    if (nextAttempt > this.maxRetryCount) {
      return { shouldRetry: false, nextAttempt, delayMs: 0 };
    }
    const delayMs = EMAIL_RETRY_BACKOFF_MS[Math.min(nextAttempt, EMAIL_RETRY_BACKOFF_MS.length - 1)] ?? 0;
    return { shouldRetry: true, nextAttempt, delayMs };
  }
}

export function queueStatusAfterFailure(
  retryDecision: RetryDecision,
): "pending" | "failed" {
  return retryDecision.shouldRetry ? "pending" : "failed";
}
