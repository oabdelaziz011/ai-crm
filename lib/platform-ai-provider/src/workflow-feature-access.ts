/**
 * Pure helpers for Workflow AI tenant gating (Sprint 4).
 */

export function isWorkflowRouteAccessible(input: {
  isSuperAdmin: boolean;
  hasAutomationViewPermission: boolean;
  workflowFeatureEnabled: boolean | undefined;
}): boolean {
  if (!input.hasAutomationViewPermission && !input.isSuperAdmin) {
    return false;
  }
  if (input.isSuperAdmin) {
    return true;
  }
  if (input.workflowFeatureEnabled === false) {
    return false;
  }
  return true;
}

export function shouldShowWorkflowNavigation(input: {
  isSuperAdmin: boolean;
  hasAutomationViewPermission: boolean;
  workflowFeatureEnabled: boolean | undefined;
}): boolean {
  return isWorkflowRouteAccessible(input);
}

/** Non-AI automation flow execution and CRUD eligibility. */
export function isWorkflowExecutionEligible(input: {
  automationEnabled: boolean;
}): boolean {
  return input.automationEnabled;
}

/** AI LLM workflow nodes (summarize, extract, decision). */
export function isWorkflowAiNodeEligible(input: {
  automationEnabled: boolean;
  aiChatEnabled: boolean;
}): boolean {
  return input.automationEnabled && input.aiChatEnabled;
}

/** Agentic tool-loop path inside workflow AI execution. */
export function isWorkflowToolLoopEligible(input: {
  automationEnabled: boolean;
  aiChatEnabled: boolean;
  toolCallingEnabled: boolean;
}): boolean {
  return (
    input.automationEnabled && input.aiChatEnabled && input.toolCallingEnabled
  );
}

/** Knowledge-search workflow nodes (retrieval-only). */
export function isWorkflowKnowledgeNodeEligible(input: {
  automationEnabled: boolean;
  knowledgeEnabled: boolean;
  embeddingsEnabled: boolean;
}): boolean {
  return (
    input.automationEnabled && input.knowledgeEnabled && input.embeddingsEnabled
  );
}
