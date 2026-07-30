export {
  isWorkflowExecutionEligible,
  isWorkflowRouteAccessible,
  shouldShowWorkflowNavigation,
} from "@workspace/platform-ai-provider";
import {
  isWorkflowRouteAccessible as isWorkflowRouteAccessibleBase,
} from "@workspace/platform-ai-provider";

export function canViewAutomation(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("automation.view");
}

export function isAutomationRouteAccessible(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  workflowFeatureEnabled: boolean | undefined;
}): boolean {
  return isWorkflowRouteAccessibleBase({
    isSuperAdmin: input.isSuperAdmin,
    hasAutomationViewPermission: canViewAutomation(input.hasPermission, input.isSuperAdmin),
    workflowFeatureEnabled: input.workflowFeatureEnabled,
  });
}

export function shouldShowAutomationNavigation(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  workflowFeatureEnabled: boolean | undefined;
}): boolean {
  return isAutomationRouteAccessible(input);
}

export function areWorkflowAiNodesEnabled(workflowFeatureEnabled: boolean | undefined): boolean {
  if (workflowFeatureEnabled === false) {
    return false;
  }
  return true;
}
