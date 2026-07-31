export {
  canExecuteAgents,
  canManageAgents,
  canResumeAgent,
  canStartAgent,
  canViewAgents,
} from "@workspace/platform-ai-provider";
import {
  canExecuteAgents as canExecuteAgentsBase,
  canManageAgents as canManageAgentsBase,
  canResumeAgent as canResumeAgentBase,
  canStartAgent as canStartAgentBase,
  canViewAgents as canViewAgentsBase,
  isAgentsAccessible as isAgentsAccessibleBase,
  shouldShowAgentsNavigation as shouldShowAgentsNavigationBase,
} from "@workspace/platform-ai-provider";

const AGENTS_VIEW_PERMISSION = "agents.view";
const AGENTS_EXECUTE_PERMISSION = "agents.execute";
const AGENTS_MANAGE_PERMISSION = "agents.manage";

export function hasAgentsViewPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission(AGENTS_VIEW_PERMISSION);
}

export function hasAgentsExecutePermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission(AGENTS_EXECUTE_PERMISSION);
}

export function hasAgentsManagePermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission(AGENTS_MANAGE_PERMISSION);
}

/** Alias for {@link hasAgentsManagePermission}. */
export const hasManagePermission = hasAgentsManagePermission;

export function isAgentsAccessible(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return isAgentsAccessibleBase({
    isSuperAdmin: input.isSuperAdmin,
    hasAgentsViewPermission: hasAgentsViewPermission(input.hasPermission, input.isSuperAdmin),
    agentsFeatureEnabled: input.agentsFeatureEnabled,
  });
}

export function shouldShowAgentsNavigation(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return shouldShowAgentsNavigationBase({
    isSuperAdmin: input.isSuperAdmin,
    hasAgentsViewPermission: hasAgentsViewPermission(input.hasPermission, input.isSuperAdmin),
    agentsFeatureEnabled: input.agentsFeatureEnabled,
  });
}

export function canStartAgentWorkflow(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return canStartAgentBase({
    isSuperAdmin: input.isSuperAdmin,
    hasAgentsExecutePermission: hasAgentsExecutePermission(input.hasPermission, input.isSuperAdmin),
    agentsFeatureEnabled: input.agentsFeatureEnabled,
  });
}

export function canResumeAgentWorkflow(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return canResumeAgentBase({
    isSuperAdmin: input.isSuperAdmin,
    hasAgentsExecutePermission: hasAgentsExecutePermission(input.hasPermission, input.isSuperAdmin),
    agentsFeatureEnabled: input.agentsFeatureEnabled,
  });
}

export function canViewAgentHistory(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return canViewAgentsBase({
    isSuperAdmin: input.isSuperAdmin,
    hasAgentsViewPermission: hasAgentsViewPermission(input.hasPermission, input.isSuperAdmin),
    agentsFeatureEnabled: input.agentsFeatureEnabled,
  });
}

export function canExecuteAgentWorkflow(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return canExecuteAgentsBase({
    isSuperAdmin: input.isSuperAdmin,
    hasAgentsExecutePermission: hasAgentsExecutePermission(input.hasPermission, input.isSuperAdmin),
    agentsFeatureEnabled: input.agentsFeatureEnabled,
  });
}

export function canManageAgentWorkflows(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return canManageAgentsBase({
    isSuperAdmin: input.isSuperAdmin,
    hasAgentsManagePermission: hasAgentsManagePermission(input.hasPermission, input.isSuperAdmin),
    agentsFeatureEnabled: input.agentsFeatureEnabled,
  });
}
