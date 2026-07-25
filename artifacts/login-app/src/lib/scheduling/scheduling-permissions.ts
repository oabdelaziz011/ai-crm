export function canViewScheduling(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("scheduling.view") || hasPermission("settings.view");
}

export function canEditScheduling(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("scheduling.edit") || hasPermission("settings.edit");
}

export function isSchedulingRoutePermitted(
  permission: string | undefined,
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  if (!permission) return canViewScheduling(hasPermission, isSuperAdmin);
  return hasPermission(permission) || hasPermission("settings.view");
}
