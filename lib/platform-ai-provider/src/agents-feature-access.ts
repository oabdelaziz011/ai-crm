/**
 * Pure helpers for AI Agents tenant gating (Sprint 6.1).
 */

export function isAgentsAccessible(input: {
  isSuperAdmin: boolean;
  hasRuntimeExecutePermission: boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  if (!input.hasRuntimeExecutePermission && !input.isSuperAdmin) {
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

export function shouldShowAgentsNavigation(input: {
  isSuperAdmin: boolean;
  hasRuntimeExecutePermission: boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return isAgentsAccessible(input);
}

export function canStartAgent(input: {
  isSuperAdmin: boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  if (input.isSuperAdmin) {
    return true;
  }
  if (input.agentsFeatureEnabled === false) {
    return false;
  }
  return true;
}

export function canResumeAgent(input: {
  isSuperAdmin: boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return canStartAgent(input);
}
