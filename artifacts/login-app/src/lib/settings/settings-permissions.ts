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
  route: { permission?: string; superAdminOnly?: boolean },
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (route.superAdminOnly && !isSuperAdmin) {
    return false;
  }
  if (!canViewSettings(hasPermission, isSuperAdmin)) {
    return false;
  }
  if (!route.permission) {
    return true;
  }
  if (isSuperAdmin) {
    return true;
  }
  if (route.permission === "scheduling.view") {
    return hasPermission("scheduling.view") || hasPermission("settings.view");
  }
  return hasPermission(route.permission);
}
