export const ORGANIZATION_PERMISSIONS = {
  view: "organization.view",
  manage: "organization.manage",
  transfer: "organization.transfer",
  transferApprove: "organization.transfer.approve",
} as const;

export function canViewOrganization(permissions: string[], isSuperAdmin = false): boolean {
  return isSuperAdmin || permissions.includes(ORGANIZATION_PERMISSIONS.view);
}

export function canManageOrganization(permissions: string[], isSuperAdmin = false): boolean {
  return isSuperAdmin || permissions.includes(ORGANIZATION_PERMISSIONS.manage);
}

export function canApproveTransfers(permissions: string[], isSuperAdmin = false): boolean {
  return isSuperAdmin || permissions.includes(ORGANIZATION_PERMISSIONS.transferApprove);
}

export function filterBranchesByRegionAccess<T extends { regionId: string | null }>(
  branches: T[],
  assignedRegionIds: string[] | null,
  isGlobalAdmin: boolean,
): T[] {
  if (isGlobalAdmin || !assignedRegionIds || assignedRegionIds.length === 0) return branches;
  return branches.filter((b) => b.regionId && assignedRegionIds.includes(b.regionId));
}
