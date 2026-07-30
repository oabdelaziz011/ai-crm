export {
  canReadAnalytics,
  canReadTraces,
} from "@workspace/platform-ai-provider";
import { isAnalyticsRouteAccessible as isAnalyticsRouteAccessibleBase } from "@workspace/platform-ai-provider";

export function canViewAnalytics(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("ai.analytics.view");
}

export function isAnalyticsRouteAccessible(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  analyticsFeatureEnabled: boolean | undefined;
}): boolean {
  return isAnalyticsRouteAccessibleBase({
    isSuperAdmin: input.isSuperAdmin,
    hasAnalyticsViewPermission: canViewAnalytics(input.hasPermission, input.isSuperAdmin),
    analyticsFeatureEnabled: input.analyticsFeatureEnabled,
  });
}

export function shouldShowAnalyticsNavigation(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  analyticsFeatureEnabled: boolean | undefined;
}): boolean {
  return isAnalyticsRouteAccessible(input);
}

export function shouldShowAnalyticsIntegration(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  analyticsFeatureEnabled: boolean | undefined;
}): boolean {
  return isAnalyticsRouteAccessible(input);
}
