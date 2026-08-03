import type { LeadQueryCachePort } from "./lead-query-cache-port.js";

type LeadQueryCacheEntry<T> = { value: T; expiresAt: number };

export class InMemoryLeadQueryCache implements LeadQueryCachePort {
  private readonly store = new Map<string, LeadQueryCacheEntry<unknown>>();

  async get<T>(key: string): Promise<T | null | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
