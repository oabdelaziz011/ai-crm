export {
  canResumeAgent,
  canStartAgent,
} from "@workspace/platform-ai-provider";
import {
  isAgentsAccessible as isAgentsAccessibleBase,
} from "@workspace/platform-ai-provider";

export function canExecuteRuntime(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("runtime.execute");
}

export function isAgentsAccessible(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return isAgentsAccessibleBase({
    isSuperAdmin: input.isSuperAdmin,
    hasRuntimeExecutePermission: canExecuteRuntime(input.hasPermission, input.isSuperAdmin),
    agentsFeatureEnabled: input.agentsFeatureEnabled,
  });
}

export function shouldShowAgentsNavigation(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return isAgentsAccessible(input);
}

export function canStartAgentWorkflow(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return isAgentsAccessible(input);
}

export function canResumeAgentWorkflow(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return isAgentsAccessible(input);
}
