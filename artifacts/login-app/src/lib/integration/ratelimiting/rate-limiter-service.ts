/** Simple in-memory rate limiter for API requests. */
export class RateLimiterService {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  check(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
    }

    if (bucket.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
    }

    bucket.count += 1;
    return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
  }

  reset(key?: string) {
    if (key) this.buckets.delete(key);
    else this.buckets.clear();
  }
}

export const apiRateLimiter = new RateLimiterService();
