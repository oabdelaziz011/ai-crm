export type RetryQueueEntry = {
  id: string;
  subscriberId: string;
  eventId: string;
  eventType: string;
  attempt: number;
  maxAttempts: number;
  nextRetryAt: string;
  lastError: string;
  enqueuedAt: string;
};

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 5_000,
};

export class RetryQueue {
  private readonly entries: RetryQueueEntry[] = [];

  enqueue(entry: Omit<RetryQueueEntry, "id" | "enqueuedAt">): RetryQueueEntry {
    const record: RetryQueueEntry = {
      ...entry,
      id: `retry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      enqueuedAt: new Date().toISOString(),
    };
    this.entries.push(record);
    return record;
  }

  list(): RetryQueueEntry[] {
    return [...this.entries];
  }

  listReady(now = Date.now()): RetryQueueEntry[] {
    return this.entries.filter((e) => new Date(e.nextRetryAt).getTime() <= now);
  }

  remove(id: string): void {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx >= 0) this.entries.splice(idx, 1);
  }

  clear(): void {
    this.entries.length = 0;
  }
}

export class RetryEngine {
  constructor(
    private readonly queue: RetryQueue,
    private readonly options: RetryOptions = {},
  ) {}

  computeDelayMs(attempt: number): number {
    const { baseDelayMs, maxDelayMs } = { ...DEFAULT_RETRY_OPTIONS, ...this.options };
    const exponential = baseDelayMs * 2 ** (attempt - 1);
    return Math.min(exponential, maxDelayMs);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const { maxAttempts } = { ...DEFAULT_RETRY_OPTIONS, ...this.options };
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          const delay = this.computeDelayMs(attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  enqueueFailed(input: {
    subscriberId: string;
    eventId: string;
    eventType: string;
    attempt: number;
    error: string;
  }): RetryQueueEntry {
    const maxAttempts = this.options.maxAttempts ?? DEFAULT_RETRY_OPTIONS.maxAttempts;
    const nextAttempt = input.attempt + 1;
    const delay = this.computeDelayMs(nextAttempt);
    return this.queue.enqueue({
      subscriberId: input.subscriberId,
      eventId: input.eventId,
      eventType: input.eventType,
      attempt: nextAttempt,
      maxAttempts,
      nextRetryAt: new Date(Date.now() + delay).toISOString(),
      lastError: input.error,
    });
  }

  getQueue(): RetryQueue {
    return this.queue;
  }
}

export const sharedRetryQueue = new RetryQueue();
export const sharedRetryEngine = new RetryEngine(sharedRetryQueue);
