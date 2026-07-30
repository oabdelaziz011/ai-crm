export {
  isKnowledgeRetrievalEligible,
} from "@workspace/platform-ai-provider";
import {
  isKnowledgeRouteAccessible as isKnowledgeRouteAccessibleBase,
  shouldShowKnowledgeAssistantTab as shouldShowKnowledgeAssistantTabBase,
} from "@workspace/platform-ai-provider";
import { canViewKnowledge } from "@/lib/knowledge/knowledge-permissions";

export function isKnowledgeRouteAccessible(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  knowledgeFeatureEnabled: boolean | undefined;
}): boolean {
  return isKnowledgeRouteAccessibleBase({
    isSuperAdmin: input.isSuperAdmin,
    hasKnowledgeViewPermission: canViewKnowledge(input.hasPermission, input.isSuperAdmin),
    knowledgeFeatureEnabled: input.knowledgeFeatureEnabled,
  });
}

export function shouldShowKnowledgeNavigation(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  knowledgeFeatureEnabled: boolean | undefined;
}): boolean {
  return isKnowledgeRouteAccessible(input);
}

export function shouldShowKnowledgeAssistantTab(input: {
  isSuperAdmin: boolean;
  knowledgeFeatureEnabled: boolean | undefined;
}): boolean {
  return shouldShowKnowledgeAssistantTabBase(input);
}
