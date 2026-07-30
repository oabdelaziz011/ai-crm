/**
 * Pure helpers for AI Analytics tenant gating (Sprint 5).
 */

export function isAnalyticsRouteAccessible(input: {
  isSuperAdmin: boolean;
  hasAnalyticsViewPermission: boolean;
  analyticsFeatureEnabled: boolean | undefined;
}): boolean {
  if (!input.hasAnalyticsViewPermission && !input.isSuperAdmin) {
    return false;
  }
  if (input.isSuperAdmin) {
    return true;
  }
  if (input.analyticsFeatureEnabled === false) {
    return false;
  }
  return true;
}

export function shouldShowAnalyticsNavigation(input: {
  isSuperAdmin: boolean;
  hasAnalyticsViewPermission: boolean;
  analyticsFeatureEnabled: boolean | undefined;
}): boolean {
  return isAnalyticsRouteAccessible(input);
}

export function canReadAnalytics(input: {
  isSuperAdmin: boolean;
  analyticsFeatureEnabled: boolean | undefined;
}): boolean {
  if (input.isSuperAdmin) {
    return true;
  }
  if (input.analyticsFeatureEnabled === false) {
    return false;
  }
  return true;
}

export function canReadTraces(input: {
  isSuperAdmin: boolean;
  analyticsFeatureEnabled: boolean | undefined;
}): boolean {
  return canReadAnalytics(input);
}
