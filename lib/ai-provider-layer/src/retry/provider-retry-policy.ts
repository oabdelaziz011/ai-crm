export interface ProviderRetryPolicy {
  readonly maxAttempts: number;
  shouldRetry(error: unknown, attempt: number): boolean;
  getDelayMs(attempt: number): number;
}

export type ProviderRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export class ExponentialProviderRetryPolicy implements ProviderRetryPolicy {
  readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: ProviderRetryOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 250;
    this.maxDelayMs = options.maxDelayMs ?? 5_000;
  }

  shouldRetry(_error: unknown, attempt: number): boolean {
    return attempt < this.maxAttempts;
  }

  getDelayMs(attempt: number): number {
    return Math.min(this.baseDelayMs * 2 ** Math.max(0, attempt - 1), this.maxDelayMs);
  }
}

export async function executeProviderWithRetry<T>(
  operation: () => Promise<T>,
  policy: ProviderRetryPolicy,
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
