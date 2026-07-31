import {
  canResumeAgentWorkflow,
  canStartAgentWorkflow,
  canViewAgentHistory,
  shouldShowAgentsNavigation,
} from "./agents-access";

/** Shared RBAC + feature-flag inputs used by Floating AI agent surfaces. */
export type AgentAccessInput = {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  agentsFeatureEnabled: boolean | undefined;
};

export function resolveAgentNavigationGating(input: AgentAccessInput) {
  return {
    showAgentTab: shouldShowAgentsNavigation(input),
  };
}

/** Pure UI gating flags for AgentWorkflowPanel (Sprint 6.2.2 testability). */
export function resolveAgentWorkflowPanelGating(input: AgentAccessInput) {
  const canView = canViewAgentHistory(input);
  const canStart = canStartAgentWorkflow(input);
  const canResume = canResumeAgentWorkflow(input);
  const { isSuperAdmin, agentsFeatureEnabled } = input;

  return {
    canView,
    canStart,
    canResume,
    featureDisabled: agentsFeatureEnabled === false && !isSuperAdmin,
    permissionDenied: !canView && !isSuperAdmin,
    executeDenied: !canStart && !isSuperAdmin && canView,
    showHistory: canView,
    showStartComposer: canStart,
    showResumeButton: canResume,
  };
}

export function resolveAgentStartErrorMessage(
  startError: string | null | undefined,
  messages: {
    executeDenied: string;
    permissionDenied: string;
    featureDisabled: string;
  },
): string | null {
  if (!startError) return null;
  if (startError.includes("agents.execute")) return messages.executeDenied;
  if (startError.includes("AGENTS_PERMISSION_DENIED") || startError.includes("Permission denied")) {
    return messages.permissionDenied;
  }
  if (startError.includes("AGENTS_FEATURE_DISABLED")) return messages.featureDisabled;
  return startError;
}
