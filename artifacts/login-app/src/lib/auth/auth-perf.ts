type AuthPerfEvent =
  | "TOKEN_REFRESHED"
  | "TOKEN_REFRESH_SKIP"
  | "AUTH_RELOAD_START"
  | "AUTH_RELOAD_END"
  | "AUTH_RELOAD_ERROR"
  | "QUERY_FETCH"
  | "RENDER";

type AuthPerfPayload = Record<string, string | number | boolean | null | undefined>;

const enabled =
  typeof import.meta !== "undefined"
  && Boolean(import.meta.env?.DEV);

const counters = {
  tokenRefreshed: 0,
  tokenRefreshSkipped: 0,
  authReloads: 0,
  authReloadMsTotal: 0,
  queryFetches: 0,
  renders: 0,
};

let activeReloadStartedAt: number | null = null;

function emit(event: AuthPerfEvent, payload?: AuthPerfPayload): void {
  if (!enabled) return;
  console.debug(`[auth-perf] ${event}`, payload ?? {});
}

export function authPerfTokenRefreshed(userId: string | null): void {
  counters.tokenRefreshed += 1;
  emit("TOKEN_REFRESHED", { userId, count: counters.tokenRefreshed });
}

export function authPerfTokenRefreshSkipped(userId: string | null, reason: string): void {
  counters.tokenRefreshSkipped += 1;
  emit("TOKEN_REFRESH_SKIP", { userId, reason, count: counters.tokenRefreshSkipped });
}

export function authPerfReloadStart(trigger: string, mode: "bootstrap" | "background"): void {
  counters.authReloads += 1;
  activeReloadStartedAt = performance.now();
  emit("AUTH_RELOAD_START", { trigger, mode, count: counters.authReloads });
}

export function authPerfReloadEnd(trigger: string, mode: "bootstrap" | "background"): void {
  const startedAt = activeReloadStartedAt;
  activeReloadStartedAt = null;
  const durationMs = startedAt == null ? 0 : Math.round(performance.now() - startedAt);
  counters.authReloadMsTotal += durationMs;
  emit("AUTH_RELOAD_END", {
    trigger,
    mode,
    durationMs,
    avgReloadMs: counters.authReloads
      ? Math.round(counters.authReloadMsTotal / counters.authReloads)
      : 0,
  });
}

export function authPerfReloadError(trigger: string, mode: "bootstrap" | "background", message: string): void {
  activeReloadStartedAt = null;
  emit("AUTH_RELOAD_ERROR", { trigger, mode, message });
}

export function authPerfQueryFetch(queryKey: unknown, state: string): void {
  counters.queryFetches += 1;
  emit("QUERY_FETCH", {
    queryKey: JSON.stringify(queryKey),
    state,
    count: counters.queryFetches,
  });
}

export function authPerfRender(component: string): void {
  counters.renders += 1;
  emit("RENDER", { component, count: counters.renders });
}

export function authPerfSnapshot(queryCount?: number): AuthPerfPayload {
  return {
    tokenRefreshed: counters.tokenRefreshed,
    tokenRefreshSkipped: counters.tokenRefreshSkipped,
    authReloads: counters.authReloads,
    avgAuthReloadMs: counters.authReloads
      ? Math.round(counters.authReloadMsTotal / counters.authReloads)
      : 0,
    queryFetches: counters.queryFetches,
    renders: counters.renders,
    activeQueries: queryCount ?? null,
  };
}

/** Exposed on window in dev for manual before/after comparison. */
export function installAuthPerfDebugGlobal(getQueryCount: () => number): void {
  if (!enabled || typeof window === "undefined") return;
  (window as unknown as { __VALUEOR_AUTH_PERF__?: { snapshot: () => AuthPerfPayload } }).__VALUEOR_AUTH_PERF__ = {
    snapshot: () => authPerfSnapshot(getQueryCount()),
  };
}
