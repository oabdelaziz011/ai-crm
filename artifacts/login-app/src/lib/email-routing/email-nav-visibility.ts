/** Pure entitlement + RBAC gate for Email sub-nav items. */
export function isEmailNavRouteVisible(
  route: { commercialFeatureCode?: string; permission?: string },
  commercialFeatureEnabled?: (featureCode: string) => boolean | undefined,
  auth?: {
    hasPermission?: (code: string) => boolean;
    isSuperAdmin?: boolean;
  },
): boolean {
  if (route.commercialFeatureCode && auth?.isSuperAdmin !== true) {
    if (commercialFeatureEnabled?.(route.commercialFeatureCode) !== true) {
      return false;
    }
  }
  if (route.permission && auth?.isSuperAdmin !== true) {
    if (!auth?.hasPermission?.(route.permission)) {
      return false;
    }
  }
  return true;
}
