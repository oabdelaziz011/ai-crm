import { hashRuntimePayload } from "../utils/runtime-crypto.js";

export type RuntimeCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export type RuntimeCacheKeyInput = {
  promptVersionId: string;
  variablesHash: string;
  contextHash: string;
  providerKey: string;
  model: string;
};

export class RuntimeCacheRegistry {
  private readonly stores = new Map<string, Map<string, RuntimeCacheEntry<unknown>>>();

  registerStore(name: string): this {
    if (!this.stores.has(name)) this.stores.set(name, new Map());
    return this;
  }

  buildKey(input: RuntimeCacheKeyInput): string {
    return hashRuntimePayload(
      JSON.stringify({
        promptVersionId: input.promptVersionId,
        variablesHash: input.variablesHash,
        contextHash: input.contextHash,
        providerKey: input.providerKey,
        model: input.model,
      }),
    );
  }

  get<T>(store: string, key: string): T | undefined {
    const bucket = this.stores.get(store);
    if (!bucket) return undefined;
    const entry = bucket.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      bucket.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(store: string, key: string, value: T, ttlMs = 60_000): void {
    const bucket = this.stores.get(store) ?? new Map();
    bucket.set(key, { value, expiresAt: Date.now() + ttlMs });
    this.stores.set(store, bucket);
  }

  stats(store: string): { size: number; hits: number; misses: number } {
    return { size: this.stores.get(store)?.size ?? 0, hits: 0, misses: 0 };
  }
}

export function createDefaultRuntimeCacheRegistry(): RuntimeCacheRegistry {
  const registry = new RuntimeCacheRegistry();
  registry.registerStore("execution");
  return registry;
}
