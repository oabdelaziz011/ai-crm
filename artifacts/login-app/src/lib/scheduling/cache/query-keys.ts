/** Stable React Query keys for scheduling reads — lib layer only (no hooks). */

export const SCHEDULING_RESOURCES_KEY = ["scheduling", "resources"] as const;
export const SCHEDULING_BRANCHES_KEY = ["scheduling", "branches"] as const;

export function schedulingResourcesKey(companyId: string | null) {
  return [...SCHEDULING_RESOURCES_KEY, companyId] as const;
}

export function schedulingResourceKey(companyId: string | null, resourceId: string | null) {
  return [...SCHEDULING_RESOURCES_KEY, companyId, resourceId] as const;
}

export function schedulingBranchesKey(companyId: string | null) {
  return [...SCHEDULING_BRANCHES_KEY, companyId] as const;
}
