/** Simple in-memory rate limiter for portal auth and booking endpoints. */
export class PortalRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxHits: number,
    private readonly windowMs: number,
  ) {}

  isAllowed(key: string): boolean {
    const now = Date.now();
    const timestamps = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (timestamps.length >= this.maxHits) {
      this.hits.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }
}

export const portalAuthRateLimiter = new PortalRateLimiter(5, 60_000);
export const portalBookingRateLimiter = new PortalRateLimiter(10, 60_000);
