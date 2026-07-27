import { QueryClient } from "@tanstack/react-query";
import { authPerfQueryFetch, installAuthPerfDebugGlobal } from "@/lib/auth/auth-perf";

/** Keep previous cache entry visible while refetching (TanStack Query v5 placeholderData). */
export function keepPreviousQueryData<T>(previousData: T | undefined): T | undefined {
  return previousData;
}

export function createAppQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: true,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
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
