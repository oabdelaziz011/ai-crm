import type { ConversationState } from "@workspace/ai-conversation";
import type { PromptSectionKey, PromptTemplateType, PromptLifecycleStatus } from "./constants.js";
import type { PromptPolicy } from "./policies/prompt-policy.js";

export type PromptSectionConfig = {
  enabled?: boolean;
  title?: string;
  content?: string;
};

export type OutputContract = {
  format: "text" | "json";
  instructions: string;
  schema?: Record<string, unknown>;
};

export type PromptTemplateRecord = {
  id: string;
  company_id: string | null;
  key: string;
  display_name: string;
  description: string;
  template_type: PromptTemplateType;
  section_order: PromptSectionKey[];
  is_enabled: boolean;
  active_version_id: string | null;
  has_unpublished_draft?: boolean;
  created_at: string;
  updated_at: string;
};

export type PromptTemplateVersionRecord = {
  id: string;
  template_id: string;
  version_number: number;
  version_label: string;
  sections: Partial<Record<PromptSectionKey, PromptSectionConfig>>;
  output_contract: OutputContract;
  change_notes: string;
  is_active: boolean;
  lifecycle_status?: PromptLifecycleStatus;
  policies?: PromptPolicy;
  created_at: string;
  created_by: string | null;
};

export type PromptBuildRecord = {
  id: string;
  company_id: string;
  conversation_id: string | null;
  template_id: string;
  template_version_id: string;
  template_key: string;
  template_type: PromptTemplateType;
  sections: BuiltPromptSection[];
  final_prompt: string;
  output_contract: OutputContract;
  metadata?: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
};

export type BuiltPromptSection = {
  key: PromptSectionKey;
  title: string;
  content: string;
};

export type BuiltPrompt = {
  build_id: string | null;
  template_key: string;
  template_type: PromptTemplateType;
  template_version_id: string;
  sections: BuiltPromptSection[];
  final_prompt: string;
  output_contract: OutputContract;
  metadata?: {
    renderedSize: number;
    variableCount: number;
    estimatedTokens: number;
    executionTimeMs: number;
  };
};

export type PromptMessage = {
  role: "customer" | "assistant" | "system";
  content: string;
};

export type PromptToolResult = {
  tool_key: string;
  status: string;
  output: Record<string, unknown> | null;
};

export type PromptIntentDecision = {
  intent_key: string;
  confidence: number;
  matched_tool: string | null;
  reason: string;
};

export type PromptAssistantProfile = {
  name?: string;
  personality?: string;
  welcome_message?: string;
};

export type PromptContextInput = {
  companyId: string;
  conversationId?: string | null;
  language?: string;
  tone?: string;
  assistantProfile?: PromptAssistantProfile;
  conversationState?: ConversationState;
  conversationSummary?: string | null;
  recentMessages?: PromptMessage[];
  intentDecision?: PromptIntentDecision | null;
  toolResults?: PromptToolResult[];
  companyPolicies?: string[];
  formattingRules?: string[];
  safetyInstructions?: string[];
  systemInstructions?: string[];
};

export type BuildPromptInput = {
  companyId: string;
  templateKey?: string;
  templateType?: PromptTemplateType;
  conversationId?: string | null;
  context: PromptContextInput;
};

export type CreatePromptTemplateInput = {
  companyId: string;
  key: string;
  displayName: string;
  description?: string;
  templateType: PromptTemplateType;
  sectionOrder: PromptSectionKey[];
};

export type CreatePromptTemplateVersionInput = {
  templateId: string;
  versionLabel: string;
  sections: Partial<Record<PromptSectionKey, PromptSectionConfig>>;
  outputContract: OutputContract;
  changeNotes?: string;
  activate?: boolean;
  lifecycleStatus?: PromptLifecycleStatus;
  policies?: PromptPolicy;
  createdBy?: string | null;
};

export type ListPromptTemplatesFilter = {
  companyId?: string | null;
  templateType?: PromptTemplateType;
  includeSystem?: boolean;
  includeDisabled?: boolean;
};

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type BuilderSectionMap = Partial<Record<PromptSectionKey, BuiltPromptSection>>;
