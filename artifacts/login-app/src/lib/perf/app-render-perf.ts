type AppPerfEvent =
  | "AUTH_CONTEXT_UPDATE"
  | "FLOATING_AI_UPDATE"
  | "DUPLICATE_QUERY"
  | "CACHE_HIT"
  | "CACHE_MISS"
  | "PROVIDER_RENDER";

type AppPerfPayload = Record<string, string | number | boolean | null | undefined>;

const enabled =
  typeof import.meta !== "undefined"
  && Boolean(import.meta.env?.DEV);

const counters = {
  authContextUpdates: 0,
  floatingAiUpdates: 0,
  duplicateQueries: 0,
  cacheHits: 0,
  cacheMisses: 0,
  providerRenderCount: 0,
  /** Legacy auth-perf counters kept for before/after comparison. */
  tokenRefreshed: 0,
  tokenRefreshSkipped: 0,
  authReloads: 0,
  authReloadMsTotal: 0,
  queryFetches: 0,
};

let activeReloadStartedAt: number | null = null;
const recentFetchKeys = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 2_000;

function emit(event: AppPerfEvent, payload?: AppPerfPayload): void {
  if (!enabled) return;
  console.debug(`[app-perf] ${event}`, payload ?? {});
}

function queryKeyString(queryKey: unknown): string {
  return JSON.stringify(queryKey);
}

export function appPerfAuthContextUpdate(slice: string): void {
  counters.authContextUpdates += 1;
  emit("AUTH_CONTEXT_UPDATE", { slice, count: counters.authContextUpdates });
}

export function appPerfFloatingAiUpdate(reason: string): void {
  counters.floatingAiUpdates += 1;
  emit("FLOATING_AI_UPDATE", { reason, count: counters.floatingAiUpdates });
}

export function appPerfProviderRender(provider: string): void {
  counters.providerRenderCount += 1;
  emit("PROVIDER_RENDER", { provider, count: counters.providerRenderCount });
}

export function appPerfQueryFetch(queryKey: unknown, hadCachedData: boolean): void {
  counters.queryFetches += 1;
  const key = queryKeyString(queryKey);
  const now = Date.now();
  const lastFetchAt = recentFetchKeys.get(key);

  if (lastFetchAt != null && now - lastFetchAt < DUPLICATE_WINDOW_MS) {
    counters.duplicateQueries += 1;
    emit("DUPLICATE_QUERY", { queryKey: key, count: counters.duplicateQueries });
  }
  recentFetchKeys.set(key, now);

  if (hadCachedData) {
    counters.cacheHits += 1;
    emit("CACHE_HIT", { queryKey: key, count: counters.cacheHits });
  } else {
    counters.cacheMisses += 1;
    emit("CACHE_MISS", { queryKey: key, count: counters.cacheMisses });
  }
}

export function appPerfTokenRefreshed(userId: string | null): void {
  counters.tokenRefreshed += 1;
}

export function appPerfTokenRefreshSkipped(userId: string | null, _reason: string): void {
  counters.tokenRefreshSkipped += 1;
}

export function appPerfReloadStart(_trigger: string, _mode: "bootstrap" | "background"): void {
  counters.authReloads += 1;
  activeReloadStartedAt = performance.now();
}

export function appPerfReloadEnd(_trigger: string, _mode: "bootstrap" | "background"): void {
  const startedAt = activeReloadStartedAt;
  activeReloadStartedAt = null;
  const durationMs = startedAt == null ? 0 : Math.round(performance.now() - startedAt);
  counters.authReloadMsTotal += durationMs;
}

export function appPerfReloadError(_trigger: string, _mode: "bootstrap" | "background", _message: string): void {
  activeReloadStartedAt = null;
}

export function appPerfSnapshot(queryCount?: number): AppPerfPayload {
  return {
    authContextUpdates: counters.authContextUpdates,
    floatingAiUpdates: counters.floatingAiUpdates,
    duplicateQueries: counters.duplicateQueries,
    cacheHits: counters.cacheHits,
    cacheMisses: counters.cacheMisses,
    providerRenderCount: counters.providerRenderCount,
    tokenRefreshed: counters.tokenRefreshed,
    tokenRefreshSkipped: counters.tokenRefreshSkipped,
    authReloads: counters.authReloads,
    avgAuthReloadMs: counters.authReloads
      ? Math.round(counters.authReloadMsTotal / counters.authReloads)
      : 0,
    queryFetches: counters.queryFetches,
    activeQueries: queryCount ?? null,
  };
}

export function resetAppRenderPerf(): void {
  counters.authContextUpdates = 0;
  counters.floatingAiUpdates = 0;
  counters.duplicateQueries = 0;
  counters.cacheHits = 0;
  counters.cacheMisses = 0;
  counters.providerRenderCount = 0;
  counters.tokenRefreshed = 0;
  counters.tokenRefreshSkipped = 0;
  counters.authReloads = 0;
  counters.authReloadMsTotal = 0;
  counters.queryFetches = 0;
  recentFetchKeys.clear();
}

export function installAppPerfDebugGlobal(getQueryCount: () => number): void {
  if (!enabled || typeof window === "undefined") return;
  (
    window as unknown as {
      __VALUEOR_APP_PERF__?: { snapshot: () => AppPerfPayload; reset: () => void };
      __VALUEOR_AUTH_PERF__?: { snapshot: () => AppPerfPayload };
    }
  ).__VALUEOR_APP_PERF__ = {
    snapshot: () => appPerfSnapshot(getQueryCount()),
    reset: resetAppRenderPerf,
  };
  // Backward-compatible alias used by existing dev tooling.
  (
    window as unknown as { __VALUEOR_AUTH_PERF__?: { snapshot: () => AppPerfPayload } }
  ).__VALUEOR_AUTH_PERF__ = {
    snapshot: () => appPerfSnapshot(getQueryCount()),
  };
}
