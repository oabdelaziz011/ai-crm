import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";

const BRANCH_COUNT_STALE_MS = 60_000;

async function fetchActiveBranchCount(companyId: string): Promise<number> {
  const { count, error } = await supabase
    .from("branches")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Active (non-deleted) branch count for the current company. */
export function useCompanyBranchCount() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: ["company", "branch-count", companyId],
    enabled: Boolean(companyId),
    staleTime: BRANCH_COUNT_STALE_MS,
    queryFn: () => fetchActiveBranchCount(companyId!),
  });

  const branchCount = query.data ?? 0;
  return {
    companyId,
    branchCount,
    isMultiBranch: branchCount >= 2,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
