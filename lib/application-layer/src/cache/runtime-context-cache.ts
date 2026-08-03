import { MemoryPlatformCache, type PlatformCache } from "@workspace/platform-cache";
import type { AssembledContext } from "../services/context-assembly-service.js";
import type { UnifiedMemorySnapshot } from "../services/unified-memory-pipeline.js";

export type RuntimeContextCacheKey = Readonly<{
  tenantId: string;
  conversationId: string;
  variant?: string;
}>;

export type CachedRuntimeContext = Readonly<{
  assembled: AssembledContext;
  memory: UnifiedMemorySnapshot;
  cachedAt: string;
}>;

export type RuntimeContextCache = Readonly<{
  buildKey(input: RuntimeContextCacheKey): string;
  getContext(key: string): Promise<CachedRuntimeContext | null>;
  setContext(key: string, value: CachedRuntimeContext, ttlSeconds?: number): Promise<void>;
  invalidateContext(key: string): Promise<void>;
  invalidateTenant(tenantId: string): Promise<void>;
}>;

export function createRuntimeContextCache(cache: PlatformCache = new MemoryPlatformCache()): RuntimeContextCache {
  const tenantIndex = new Map<string, Set<string>>();

  function trackKey(tenantId: string, key: string) {
    const keys = tenantIndex.get(tenantId) ?? new Set<string>();
    keys.add(key);
    tenantIndex.set(tenantId, keys);
  }

  return Object.freeze({
    buildKey(input) {
      return ["ai-runtime", input.tenantId, input.conversationId, input.variant ?? "default"].join(":");
    },
    async getContext(key) {
      return cache.get<CachedRuntimeContext>(key);
    },
    async setContext(key, value, ttlSeconds = 300) {
      const tenantId = key.split(":")[1];
      if (tenantId) trackKey(tenantId, key);
      await cache.set(key, value, ttlSeconds);
    },
    async invalidateContext(key) {
      await cache.delete(key);
    },
    async invalidateTenant(tenantId) {
      const keys = tenantIndex.get(tenantId);
      if (!keys) return;
      await Promise.all([...keys].map((key) => cache.delete(key)));
      tenantIndex.delete(tenantId);
    },
  });
}

export function createPromptCache(cache: PlatformCache = new MemoryPlatformCache()) {
  return Object.freeze({
    buildKey(tenantId: string, buildId: string) {
      return `ai-prompt:${tenantId}:${buildId}`;
    },
    get: (key: string) => cache.get<string>(key),
    set: (key: string, prompt: string, ttlSeconds = 600) => cache.set(key, prompt, ttlSeconds),
    invalidate: (key: string) => cache.delete(key),
  });
}

export function createKnowledgeCache(cache: PlatformCache = new MemoryPlatformCache()) {
  return Object.freeze({
    buildKey(tenantId: string, query: string) {
      return `ai-knowledge:${tenantId}:${query.trim().toLowerCase()}`;
    },
    get: <T>(key: string) => cache.get<T>(key),
    set: <T>(key: string, value: T, ttlSeconds = 180) => cache.set(key, value, ttlSeconds),
    invalidate: (key: string) => cache.delete(key),
    invalidateTenant: async (tenantId: string, keys: Iterable<string>) => {
      for (const key of keys) {
        if (key.startsWith(`ai-knowledge:${tenantId}:`)) {
          await cache.delete(key);
        }
      }
    },
  });
}
