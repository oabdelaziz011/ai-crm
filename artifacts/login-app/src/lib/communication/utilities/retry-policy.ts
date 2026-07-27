export function computeExponentialBackoffMs(retryCount: number, baseMs = 30_000, maxMs = 900_000): number {
  const delay = baseMs * 2 ** Math.max(0, retryCount - 1);
  return Math.min(delay, maxMs);
}

export function shouldRetry(retryCount: number, maxRetries: number): boolean {
  return retryCount < maxRetries;
}
