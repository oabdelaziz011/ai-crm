import type { TicketQueryCachePort } from "./ticket-query-cache-port.js";

export class InMemoryTicketQueryCache implements TicketQueryCachePort {
  private readonly store = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async invalidateCompany(companyId: string): Promise<void> {
    const needle = `companyId=${companyId}`;
    for (const key of this.store.keys()) {
      if (key.includes(needle)) this.store.delete(key);
    }
  }
}
