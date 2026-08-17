/**
 * Client-side mirror of the DB privilege-delegation invariant:
 * non-Super-Admins may only grant/assign permissions they already hold.
 * Database RLS/RPC remains authoritative.
 */

export function canDelegatePermissionCode(
  code: string,
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  const trimmed = code.trim();
  if (!trimmed) return false;
  return hasPermission(trimmed);
}

export function filterDelegablePermissionCodes(
  codes: readonly string[],
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): string[] {
  return codes.filter((code) => canDelegatePermissionCode(code, hasPermission, isSuperAdmin));
}

export function assertPermissionsAreDelegable(
  requestedCodes: readonly string[],
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): void {
  if (isSuperAdmin) return;
  const denied = requestedCodes.filter(
    (code) => !canDelegatePermissionCode(code, hasPermission, isSuperAdmin),
  );
  if (denied.length > 0) {
    throw new Error(`permission_delegation_denied:${denied.join(",")}`);
  }
}

export function assertRolePermissionsAreDelegable(
  rolePermissionCodes: readonly string[],
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): void {
  assertPermissionsAreDelegable(rolePermissionCodes, hasPermission, isSuperAdmin);
}
