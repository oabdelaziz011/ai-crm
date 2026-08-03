export type HandoffQueryCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export interface HandoffQueryCachePort {
  get<T>(key: string): Promise<T | null | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export function buildHandoffQueryCacheKey(parts: Record<string, string | number | undefined>): string {
  return Object.entries(parts)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("|");
}
