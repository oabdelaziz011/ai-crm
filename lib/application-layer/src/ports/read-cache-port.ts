/** Read cache interface — no Redis implementation in this phase. */
export type ReadCacheKey = Readonly<{
  namespace: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  variant?: string;
}>;

export type ReadCachePort<T> = Readonly<{
  buildKey(input: ReadCacheKey): string;
  get(key: string): Promise<T | null>;
  set(key: string, value: T, ttlSeconds?: number): Promise<void>;
  invalidate(key: string): Promise<void>;
}>;

export type NoOpReadCachePort = ReadCachePort<unknown>;

export function createNoOpReadCachePort(): NoOpReadCachePort {
  return Object.freeze({
    buildKey(input) {
      return [input.namespace, input.tenantId, input.entityType, input.entityId, input.variant ?? ""].join(":");
    },
    async get() {
      return null;
    },
    async set() {},
    async invalidate() {},
  });
}
