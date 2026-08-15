/** Self-service pages every authenticated user can open (Settings → Profile, etc.). */
const SELF_SERVICE_SETTINGS_IDS = new Set([
  "personal-profile",
  "appearance",
  "account-information",
  "security",
]);

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

export function isSelfServiceSettingsRoute(routeId: string | undefined): boolean {
  return Boolean(routeId && SELF_SERVICE_SETTINGS_IDS.has(routeId));
}

export function isSettingsRoutePermitted(
  route: { id?: string; permission?: string; superAdminOnly?: boolean },
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (route.superAdminOnly && !isSuperAdmin) {
    return false;
  }
  // Personal profile / appearance / account / security — no settings.view gate.
  if (isSelfServiceSettingsRoute(route.id)) {
    return true;
  }
  if (route.permission === "tickets.manage") {
    return isSuperAdmin || hasPermission("tickets.manage") || hasPermission("settings.edit");
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
  if (route.permission === "bookings.view") {
    return (
      hasPermission("bookings.view") ||
      hasPermission("scheduling.view") ||
      hasPermission("settings.view")
    );
  }
  return hasPermission(route.permission);
}
