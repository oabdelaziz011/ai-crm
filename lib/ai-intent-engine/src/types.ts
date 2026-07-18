import type { ConversationState } from "@workspace/ai-conversation";
import type { ClassifierKey, IntentMatchStatus } from "./constants.js";

export type ClassificationRules = {
  keywords?: string[];
  phrases?: string[];
  baseConfidence?: number;
};

export type IntentDefinitionRecord = {
  id: string;
  key: string;
  display_name: string;
  description: string;
  category: string;
  priority: number;
  confidence_threshold: number;
  required_states: ConversationState[];
  required_permissions: string[];
  matched_tool_key: string | null;
  classification_rules: ClassificationRules;
  requires_human: boolean;
  requires_llm: boolean;
  is_enabled: boolean;
  version: string;
  created_at: string;
  updated_at: string;
};

export type IntentAlternative = {
  intent_key: string;
  confidence: number;
};

export type IntentMatchResult = {
  intent_key: string;
  confidence: number;
  matched_tool: string | null;
  reason: string;
  alternatives: IntentAlternative[];
  requires_human: boolean;
  requires_llm: boolean;
  classifier_key: ClassifierKey;
  status: IntentMatchStatus;
  match_id: string | null;
};

export type IntentClassificationCandidate = {
  intentKey: string;
  confidence: number;
  reason: string;
  classifierKey: ClassifierKey;
};

export type IntentClassificationContext = {
  companyId: string;
  conversationId: string;
  conversationState: ConversationState;
  messageText: string;
};

export type ResolveIntentInput = {
  conversationId: string;
  messageText: string;
};

export type UpdateIntentDefinitionInput = {
  intentId: string;
  isEnabled: boolean;
};

export type CreateIntentMatchInput = {
  companyId: string;
  conversationId: string;
  intentDefinitionId: string | null;
  intentKey: string;
  classifierKey: ClassifierKey;
  messagePreview: string;
  confidence: number;
  matchedToolKey: string | null;
  reason: string;
  alternatives: IntentAlternative[];
  requiresHuman: boolean;
  requiresLlm: boolean;
  status: IntentMatchStatus;
  createdBy?: string | null;
};

export type IntentMatchRecord = {
  id: string;
  company_id: string;
  conversation_id: string;
  intent_definition_id: string | null;
  intent_key: string;
  classifier_key: ClassifierKey;
  message_preview: string;
  confidence: number;
  matched_tool_key: string | null;
  reason: string;
  alternatives: IntentAlternative[];
  requires_human: boolean;
  requires_llm: boolean;
  status: IntentMatchStatus;
  created_at: string;
  created_by: string | null;
};

export type ListIntentMatchesFilter = {
  companyId: string;
  conversationId?: string;
  intentKey?: string;
  status?: IntentMatchStatus;
  limit?: number;
};

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type CompositeClassifierConfig = {
  ruleBasedEnabled: boolean;
  keywordEnabled: boolean;
  llmEnabled: boolean;
};
