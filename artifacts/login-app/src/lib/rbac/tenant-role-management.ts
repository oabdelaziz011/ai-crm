/**
 * Tenant Role Management surfaces CUSTOM roles only.
 * DEFAULT (Company Admin) and PLATFORM roles remain in the DB for ownership /
 * assignment, but are not shown as a fixed Manager/Employee catalog.
 */

export type RoleTypeLike = {
  role_type?: string | null;
  template_key?: string | null;
};

export function isTenantManagedCustomRole(role: RoleTypeLike): boolean {
  return (role.role_type ?? "CUSTOM") === "CUSTOM";
}

export function filterRolesForTenantManagement<T extends RoleTypeLike>(
  roles: readonly T[],
  options?: { includeProtected?: boolean },
): T[] {
  if (options?.includeProtected) return [...roles];
  return roles.filter(isTenantManagedCustomRole);
}

export function filterDelegablePermissionRecords<T extends { code?: string | null }>(
  permissions: readonly T[],
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): T[] {
  if (isSuperAdmin) return [...permissions];
  return permissions.filter((permission) => {
    const code = permission.code;
    return Boolean(code && hasPermission(code));
  });
}
