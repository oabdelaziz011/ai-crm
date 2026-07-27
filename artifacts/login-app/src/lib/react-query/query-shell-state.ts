/** TanStack Query v5 — use for skeleton vs subtle refresh decisions. */
export function queryShellStateFromQuery(query: {
  isPending: boolean;
  isFetching: boolean;
}): {
  isInitialLoad: boolean;
  isBackgroundRefresh: boolean;
  isRefetching: boolean;
} {
  const isInitialLoad = query.isPending;
  const isBackgroundRefresh = query.isFetching && !query.isPending;
  return {
    isInitialLoad,
    isBackgroundRefresh,
    isRefetching: isBackgroundRefresh,
  };
}
