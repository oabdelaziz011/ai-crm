/** In-memory sliding-window rate limiter for provider sends. */
export class CommunicationRateLimiter {
  private readonly windows = new Map<string, number[]>();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
  ) {}

  tryAcquire(key: string): boolean {
    const now = Date.now();
    const timestamps = (this.windows.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (timestamps.length >= this.maxPerWindow) {
      this.windows.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    this.windows.set(key, timestamps);
    return true;
  }
}
