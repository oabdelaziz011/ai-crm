import { MemoryPlatformCache } from "@workspace/platform-cache";
import type { ConfigurationCachePort } from "../ports/configuration-ports.js";

export function createConfigurationCachePort(): ConfigurationCachePort {
  const cache = new MemoryPlatformCache();

  return Object.freeze({
    buildKey(tenantId, domain, scopeKey) {
      return `config:${tenantId}:${domain}:${scopeKey}`;
    },
    async get<T>(key: string) {
      return cache.get<T>(key);
    },
    async set<T>(key: string, value: T, ttlSeconds = 120) {
      await cache.set(key, value, ttlSeconds);
    },
    async invalidate(key) {
      await cache.delete(key);
    },
    async invalidateTenant(tenantId) {
      // Memory cache has no prefix scan — callers invalidate explicit keys.
      void tenantId;
    },
  });
}

export function createNoOpConfigurationCachePort(): ConfigurationCachePort {
  return Object.freeze({
    buildKey(tenantId, domain, scopeKey) {
      return `config:${tenantId}:${domain}:${scopeKey}`;
    },
    async get() {
      return null;
    },
    async set() {},
    async invalidate() {},
    async invalidateTenant() {},
  });
}
