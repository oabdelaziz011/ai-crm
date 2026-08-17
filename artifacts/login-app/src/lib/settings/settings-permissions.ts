/** Self-service pages every authenticated user can open (Settings → Profile, etc.). */
const SELF_SERVICE_SETTINGS_IDS = new Set([
  "personal-profile",
  "appearance",
  "account-information",
  "security",
  "notifications",
]);

export type SettingsAccessRoute = {
  id?: string;
  permission?: string;
  superAdminOnly?: boolean;
  /** When set, requires RBAC AND commercial entitlement (fail closed). */
  commercialFeatureCode?: string;
};

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

/**
 * Settings access: personal (self-service) | RBAC company | RBAC ∧ commercial entitlement.
 * Navigation visibility alone is not security — route guards must call this too.
 */
export function isSettingsRoutePermitted(
  route: SettingsAccessRoute,
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
  commercialFeatureEnabled?: (featureCode: string) => boolean | undefined,
): boolean {
  if (route.superAdminOnly && !isSuperAdmin) {
    return false;
  }
  // Personal profile / appearance / account / security / notifications — no settings.view gate.
  if (isSelfServiceSettingsRoute(route.id)) {
    return true;
  }
  if (route.permission === "tickets.manage") {
    if (!(isSuperAdmin || hasPermission("tickets.manage") || hasPermission("settings.edit"))) {
      return false;
    }
  } else if (!canViewSettings(hasPermission, isSuperAdmin)) {
    return false;
  } else if (!route.permission) {
    // fall through to commercial check
  } else if (isSuperAdmin) {
    // Super Admin bypasses remaining RBAC + commercial checks below.
    return true;
  } else if (route.permission === "scheduling.view") {
    if (!(hasPermission("scheduling.view") || hasPermission("settings.view"))) {
      return false;
    }
  } else if (route.permission === "bookings.view") {
    if (
      !(
        hasPermission("bookings.view") ||
        hasPermission("scheduling.view") ||
        hasPermission("settings.view")
      )
    ) {
      return false;
    }
  } else if (!hasPermission(route.permission)) {
    return false;
  }

  if (route.commercialFeatureCode) {
    if (isSuperAdmin) return true;
    // Fail closed: missing lookup / loading / false all deny.
    return commercialFeatureEnabled?.(route.commercialFeatureCode) === true;
  }

  return true;
}
