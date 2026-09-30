const SMS_RETRY_BACKOFF_MS = [30_000, 120_000, 300_000] as const;
export const DEFAULT_SMS_MAX_RETRY = 3;

export type SmsRetryDecision = {
  shouldRetry: boolean;
  nextAttempt: number;
  delayMs: number;
};

export class SmsRetryPolicy {
  constructor(private readonly maxRetryCount: number = DEFAULT_SMS_MAX_RETRY) {}

  evaluate(currentRetryCount: number): SmsRetryDecision {
    const nextAttempt = currentRetryCount + 1;
    if (nextAttempt > this.maxRetryCount) {
      return { shouldRetry: false, nextAttempt, delayMs: 0 };
    }
    const delayMs =
      SMS_RETRY_BACKOFF_MS[Math.min(nextAttempt - 1, SMS_RETRY_BACKOFF_MS.length - 1)] ?? 0;
    return { shouldRetry: true, nextAttempt, delayMs };
  }
}
