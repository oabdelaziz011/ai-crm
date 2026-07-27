import type { QueryClient } from "@tanstack/react-query";
import { SCHEDULING_BRANCHES_KEY } from "@/lib/scheduling/cache/query-keys";
import {
  BRANCHES_KEY,
  branchDetailKey,
  branchStatsKey,
  branchesListKey,
  currentUserBranchesKey,
  serviceBranchAvailabilityKey,
  userBranchAssignmentsKey,
} from "./branch-query-keys";

export function invalidateBranchQueries(
  qc: QueryClient,
  companyId: string | null,
  branchId?: string | null,
) {
  void qc.invalidateQueries({ queryKey: BRANCHES_KEY });
  void qc.invalidateQueries({ queryKey: SCHEDULING_BRANCHES_KEY });
  if (companyId) {
    void qc.invalidateQueries({ queryKey: branchesListKey(companyId) });
    void qc.invalidateQueries({ queryKey: branchStatsKey(companyId) });
    void qc.invalidateQueries({ queryKey: userBranchAssignmentsKey(companyId) });
    void qc.invalidateQueries({ queryKey: currentUserBranchesKey(companyId, null) });
  }
  if (companyId && branchId) {
    void qc.invalidateQueries({ queryKey: branchDetailKey(companyId, branchId) });
    void qc.invalidateQueries({ queryKey: serviceBranchAvailabilityKey(companyId, null) });
  }
}
