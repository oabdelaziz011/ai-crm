import { useQuery } from "@tanstack/react-query";
import { fetchRoleListCounts, ROLE_LIST_COUNTS_QUERY_KEY } from "@/lib/rbac/fetch-role-list-counts";
import { supabase } from "@/lib/supabase";

export { ROLE_LIST_COUNTS_QUERY_KEY };

export function useRoleListCounts(roleIds: string[]) {
  const sortedKey = [...roleIds].sort().join(",");
  return useQuery({
    queryKey: [...ROLE_LIST_COUNTS_QUERY_KEY, sortedKey],
    enabled: roleIds.length > 0,
    queryFn: () => fetchRoleListCounts(supabase, roleIds),
    staleTime: 15_000,
  });
}
