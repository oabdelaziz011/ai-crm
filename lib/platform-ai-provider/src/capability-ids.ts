/**
 * Catalog capability identifiers (`AiCapabilityDefinition.id`).
 * Kept separate from backend feature keys — see `capability-mapping.ts` for the join.
 */

export const PLATFORM_AI_CAPABILITY_ID = {
  AI_CHAT: "ai_chat",
  EMAIL_ASSISTANT: "email_assistant",
  WHATSAPP_ASSISTANT: "whatsapp_assistant",
  KNOWLEDGE_BASE: "knowledge_base",
  AI_ANALYTICS: "ai_analytics",
  WORKFLOW_AI: "workflow_ai",
  AI_AGENTS: "ai_agents",
  VOICE_AI: "voice_ai",
  VISION_AI: "vision_ai",
  AI_AUTOMATION: "ai_automation",
} as const;

export const PLATFORM_AI_CAPABILITY_IDS = Object.values(PLATFORM_AI_CAPABILITY_ID);

export type PlatformAICapabilityId =
  (typeof PLATFORM_AI_CAPABILITY_ID)[keyof typeof PLATFORM_AI_CAPABILITY_ID];

export function isPlatformAICapabilityId(value: string): value is PlatformAICapabilityId {
  return (PLATFORM_AI_CAPABILITY_IDS as readonly string[]).includes(value);
}
