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
  "knowledge_context",
  "output_contract",
] as const;

export type PromptSectionKey = (typeof PROMPT_SECTION_KEYS)[number];

export const PROMPT_PERMISSIONS = {
  view: "prompts.view",
  manage: "prompts.manage",
  publish: "prompts.publish",
  preview: "prompts.preview",
  rollback: "prompts.rollback",
} as const;

export const PROMPT_LIFECYCLE_STATUSES = ["draft", "published", "archived"] as const;
export type PromptLifecycleStatus = (typeof PROMPT_LIFECYCLE_STATUSES)[number];

export const ENTERPRISE_PROMPT_KINDS = [
  "system",
  "user",
  "context",
  "safety",
  "instruction",
  "examples",
  "custom",
] as const;

export type EnterprisePromptKind = (typeof ENTERPRISE_PROMPT_KINDS)[number];

export const PROMPT_LIBRARY_TEMPLATE_KEYS = [
  "customer_support",
  "booking_assistant",
  "faq_assistant",
  "sales_assistant",
  "lead_qualification",
  "appointment_booking",
  "crm_assistant",
  "workflow_decision",
  "workflow_summarize",
  "workflow_extract",
] as const;

export type PromptLibraryTemplateKey = (typeof PROMPT_LIBRARY_TEMPLATE_KEYS)[number];

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

export const PROMPT_ORCHESTRATION_MODES = ["conversation", "execution"] as const;

export type PromptOrchestrationMode = (typeof PROMPT_ORCHESTRATION_MODES)[number];

/** Sections surfaced to the model as system context (identity, policies, safety). */
export const SYSTEM_PROMPT_SECTION_KEYS = [
  "system_instructions",
  "assistant_profile",
  "company_policies",
  "language",
  "tone",
  "safety_instructions",
  "knowledge_context",
  "conversation_summary",
] as const satisfies readonly PromptSectionKey[];

/** Internal runtime instructions — never mixed into the user turn. */
export const DEVELOPER_PROMPT_SECTION_KEYS = [
  "conversation_state",
  "intent_decision",
  "tool_results",
  "formatting_rules",
  "output_contract",
] as const satisfies readonly PromptSectionKey[];

export const CONVERSATION_TOOL_DEVELOPER_INSTRUCTIONS =
  "You may call tools when the user asks you to perform an action. For general conversation, reply naturally in plain text.";

export const SECTION_SEPARATOR = "\n\n---\n\n";
