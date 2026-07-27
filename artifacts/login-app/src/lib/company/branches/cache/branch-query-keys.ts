export const BRANCHES_KEY = ["company", "branches"] as const;

export function branchesListKey(companyId: string | null, filter?: { status?: string; search?: string }) {
  return [...BRANCHES_KEY, "list", companyId, filter?.status ?? "all", filter?.search ?? ""] as const;
}

export function branchDetailKey(companyId: string | null, branchId: string | null) {
  return [...BRANCHES_KEY, "detail", companyId, branchId] as const;
}

export function branchStatsKey(companyId: string | null) {
  return [...BRANCHES_KEY, "stats", companyId] as const;
}

export function userBranchAssignmentsKey(companyId: string | null, userId?: string | null) {
  return [...BRANCHES_KEY, "user-assignments", companyId, userId ?? "all"] as const;
}

export function currentUserBranchesKey(companyId: string | null, userId: string | null) {
  return [...BRANCHES_KEY, "current-user", companyId, userId] as const;
}

export function serviceBranchAvailabilityKey(companyId: string | null, serviceId: string | null) {
  return [...BRANCHES_KEY, "service-branches", companyId, serviceId] as const;
}
