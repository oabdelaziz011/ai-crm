export interface LeadQueryCachePort {
  get<T>(key: string): Promise<T | null | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export function buildLeadQueryCacheKey(parts: Record<string, string | number | undefined>): string {
  return Object.entries(parts)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("|");
}
