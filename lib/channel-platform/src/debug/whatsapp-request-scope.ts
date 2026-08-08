/**
 * Browser-safe bridge to the WhatsApp request-scoped cache.
 * Reads globalThis only — never imports node:async_hooks.
 * Server installs the real cache via whatsapp-request-cache.ts.
 */

type RequestCacheLike = {
  getOrLoad<T>(namespace: string, key: string, loader: () => Promise<T>): Promise<T>;
  getOrCreateSync?<T>(namespace: string, key: string, factory: () => T): T;
  set?<T>(namespace: string, key: string, value: T): void;
  delete?(namespace: string, key: string): void;
};

const GLOBAL_KEY = "__WHATSAPP_REQUEST_CACHE__";
const GLOBAL_GETTER_KEY = "__WHATSAPP_GET_REQUEST_CACHE__";

function getCache(): RequestCacheLike | null {
  const host = globalThis as Record<string, unknown>;
  const getter = host[GLOBAL_GETTER_KEY];
  if (typeof getter === "function") {
    return (getter as () => RequestCacheLike | null)() ?? null;
  }
  return (host[GLOBAL_KEY] as RequestCacheLike | undefined) ?? null;
}

/**
 * Memoize a load within the active WhatsApp request scope.
 * Outside a request scope, runs the loader with no caching.
 */
export async function waRequestGetOrLoad<T>(
  namespace: string,
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  const cache = getCache();
  if (!cache) return loader();
  return cache.getOrLoad(namespace, key, loader);
}

/**
 * Memoize a synchronous factory within the active WhatsApp / workflow request scope.
 * Outside a request scope, runs the factory with no caching.
 */
export function waRequestGetOrCreateSync<T>(
  namespace: string,
  key: string,
  factory: () => T,
): T {
  const cache = getCache();
  if (!cache?.getOrCreateSync) return factory();
  return cache.getOrCreateSync(namespace, key, factory);
}

/** Seed/replace a cached value after a write (no-op outside request scope). */
export function waRequestCacheSet<T>(namespace: string, key: string, value: T): void {
  getCache()?.set?.(namespace, key, value);
}

/** Invalidate a cached key after a mutating write (no-op outside request scope). */
export function waRequestCacheDelete(namespace: string, key: string): void {
  getCache()?.delete?.(namespace, key);
}

export const WA_REQUEST_CACHE_NS = {
  company: "company",
  companyChannel: "companyChannel",
  whatsappCredentials: "whatsappCredentials",
  whatsappRuntimeConfig: "whatsappRuntimeConfig",
  conversation: "conversation",
  session: "session",
  tenantRuntimeConfig: "tenantRuntimeConfig",
  companyChannelByPhone: "companyChannelByPhone",
  schedulingServices: "schedulingServices",
  bookingDomainServices: "bookingDomainServices",
  branchServices: "branchServices",
  schedulingBookingRules: "schedulingBookingRules",
  schedulingHolidays: "schedulingHolidays",
  companyActorUserId: "companyActorUserId",
} as const;
