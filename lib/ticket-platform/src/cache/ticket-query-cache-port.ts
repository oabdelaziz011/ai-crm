export type TicketQueryCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export interface TicketQueryCachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Drop every cached entry for a company so post-mutation reads are fresh. */
  invalidateCompany(companyId: string): Promise<void>;
}

export function buildTicketQueryCacheKey(parts: Record<string, string | number | undefined>): string {
  return Object.entries(parts)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("|");
}
