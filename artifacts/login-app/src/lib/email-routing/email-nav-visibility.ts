/** Pure entitlement gate for Email sub-nav items (Sprint 7). */
export function isEmailNavRouteVisible(
  route: { commercialFeatureCode?: string },
  commercialFeatureEnabled?: (featureCode: string) => boolean | undefined,
): boolean {
  if (!route.commercialFeatureCode) return true;
  return commercialFeatureEnabled?.(route.commercialFeatureCode) === true;
}
