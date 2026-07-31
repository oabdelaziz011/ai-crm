/**
 * Pure helpers for AI Agents tenant gating and product permissions (Sprint 6.1–6.2).
 */

export function canViewAgents(input: {
  isSuperAdmin: boolean;
  hasAgentsViewPermission: boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  if (!input.hasAgentsViewPermission && !input.isSuperAdmin) {
    return false;
  }
  if (input.isSuperAdmin) {
    return true;
  }
  if (input.agentsFeatureEnabled === false) {
    return false;
  }
  return true;
}

export function canExecuteAgents(input: {
  isSuperAdmin: boolean;
  hasAgentsExecutePermission: boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  if (!input.hasAgentsExecutePermission && !input.isSuperAdmin) {
    return false;
  }
  if (input.isSuperAdmin) {
    return true;
  }
  if (input.agentsFeatureEnabled === false) {
    return false;
  }
  return true;
}

export function isAgentsAccessible(input: {
  isSuperAdmin: boolean;
  hasAgentsViewPermission: boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return canViewAgents(input);
}

export function shouldShowAgentsNavigation(input: {
  isSuperAdmin: boolean;
  hasAgentsViewPermission: boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return canViewAgents(input);
}

export function canStartAgent(input: {
  isSuperAdmin: boolean;
  hasAgentsExecutePermission: boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return canExecuteAgents(input);
}

export function canResumeAgent(input: {
  isSuperAdmin: boolean;
  hasAgentsExecutePermission: boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return canExecuteAgents(input);
}
