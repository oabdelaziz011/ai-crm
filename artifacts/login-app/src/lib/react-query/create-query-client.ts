import { QueryClient } from "@tanstack/react-query";
import { authPerfQueryFetch, installAuthPerfDebugGlobal } from "@/lib/auth/auth-perf";

/** Keep previous cache entry visible while refetching (TanStack Query v5 placeholderData). */
export function keepPreviousQueryData<T>(previousData: T | undefined): T | undefined {
  return previousData;
}

/** Default stale window for list/dashboard queries (matches global default). */
export const APP_QUERY_STALE_MS = 60_000;

/** How long inactive cache entries stay in memory. */
export const APP_QUERY_GC_MS = 10 * 60_000;

export function createAppQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: false,
        staleTime: APP_QUERY_STALE_MS,
        gcTime: APP_QUERY_GC_MS,
        placeholderData: keepPreviousQueryData,
      },
    },
  });

  client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    const { query, action } = event;
    if (action.type === "fetch" || action.type === "invalidate") {
      authPerfQueryFetch(query.queryKey, query.state.status);
    }
  });

  installAuthPerfDebugGlobal(() => client.getQueryCache().getAll().length);

  return client;
}
