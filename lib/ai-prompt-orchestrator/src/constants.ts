export const PROMPT_TEMPLATE_TYPES = [
  "conversation",
  "classification",
  "tool_assistance",
  "summarization",
  "extraction",
  "fallback",
  "escalation",
] as const;

export type PromptTemplateType = (typeof PROMPT_TEMPLATE_TYPES)[number];

export const PROMPT_SECTION_KEYS = [
  "system_instructions",
  "assistant_profile",
  "conversation_summary",
  "recent_messages",
  "conversation_state",
  "intent_decision",
  "tool_results",
  "company_policies",
  "language",
  "tone",
  "formatting_rules",
  "safety_instructions",
  "output_contract",
] as const;

export type PromptSectionKey = (typeof PROMPT_SECTION_KEYS)[number];

export const PROMPT_PERMISSIONS = {
  view: "prompts.view",
  manage: "prompts.manage",
} as const;

export const PROMPT_AUDIT_EVENTS = [
  "prompt_built",
  "template_updated",
  "template_activated",
  "template_disabled",
] as const;

export type PromptAuditEvent = (typeof PROMPT_AUDIT_EVENTS)[number];

export const DEFAULT_TEMPLATE_KEYS: Record<PromptTemplateType, string> = {
  conversation: "conversation_default",
  classification: "classification_default",
  tool_assistance: "tool_assistance_default",
  summarization: "summarization_default",
  extraction: "extraction_default",
  fallback: "fallback_default",
  escalation: "escalation_default",
};

export const SECTION_SEPARATOR = "\n\n---\n\n";
