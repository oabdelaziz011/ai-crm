/**
 * Pure helpers for Knowledge Base tenant gating (Sprint 2).
 */

export function isKnowledgeRetrievalEligible(input: {
  aiChatEnabled: boolean;
  knowledgeFeatureEnabled: boolean;
  assistantKnowledgeEnabled: boolean;
}): boolean {
  return (
    input.aiChatEnabled && input.knowledgeFeatureEnabled && input.assistantKnowledgeEnabled
  );
}

export function isKnowledgeRouteAccessible(input: {
  isSuperAdmin: boolean;
  hasKnowledgeViewPermission: boolean;
  knowledgeFeatureEnabled: boolean | undefined;
}): boolean {
  if (!input.hasKnowledgeViewPermission && !input.isSuperAdmin) {
    return false;
  }
  if (input.isSuperAdmin) {
    return true;
  }
  if (input.knowledgeFeatureEnabled === false) {
    return false;
  }
  return true;
}

export function shouldShowKnowledgeNavigation(input: {
  isSuperAdmin: boolean;
  hasKnowledgeViewPermission: boolean;
  knowledgeFeatureEnabled: boolean | undefined;
}): boolean {
  return isKnowledgeRouteAccessible(input);
}

export function shouldShowKnowledgeAssistantTab(input: {
  isSuperAdmin: boolean;
  knowledgeFeatureEnabled: boolean | undefined;
}): boolean {
  if (input.isSuperAdmin) {
    return true;
  }
  return input.knowledgeFeatureEnabled !== false;
}
