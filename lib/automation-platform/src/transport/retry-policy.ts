export interface RetryPolicy {
  readonly maxAttempts: number;
  shouldRetry(error: unknown, attempt: number): boolean;
  getDelayMs(attempt: number): number;
}

export type RetryPolicyOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableStatusCodes?: number[];
};

export class ExponentialBackoffRetryPolicy implements RetryPolicy {
  readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly retryableStatusCodes: Set<number>;

  constructor(options: RetryPolicyOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 250;
    this.maxDelayMs = options.maxDelayMs ?? 5_000;
    this.retryableStatusCodes = new Set(options.retryableStatusCodes ?? [408, 429, 500, 502, 503, 504]);
  }

  shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= this.maxAttempts) return false;
    if (error && typeof error === "object" && "statusCode" in error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode);
      if (Number.isFinite(statusCode) && !this.retryableStatusCodes.has(statusCode)) return false;
    }
    return true;
  }

  getDelayMs(attempt: number): number {
    const delay = this.baseDelayMs * 2 ** Math.max(0, attempt - 1);
    return Math.min(delay, this.maxDelayMs);
  }
}

export class NoRetryPolicy implements RetryPolicy {
  readonly maxAttempts = 1;

  shouldRetry(): boolean {
    return false;
  }

  getDelayMs(): number {
    return 0;
  }
}

export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt < policy.maxAttempts) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!policy.shouldRetry(error, attempt)) break;
      if (attempt < policy.maxAttempts) await sleep(policy.getDelayMs(attempt));
    }
  }
  throw lastError;
}
