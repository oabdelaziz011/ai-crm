export function canViewSettings(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("settings.view");
}

export function canEditSettings(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("settings.edit");
}

export function isSettingsRoutePermitted(
  permission: string | undefined,
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (!canViewSettings(hasPermission, isSuperAdmin)) {
    return false;
  }
  if (!permission) {
    return true;
  }
  if (isSuperAdmin) {
    return true;
  }
  return hasPermission(permission);
}
