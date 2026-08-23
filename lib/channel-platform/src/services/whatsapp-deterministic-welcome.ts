import type { AiEmployeeEngagementState } from "./ai-employee-engagement-session.js";
import { hasEngagementWelcomeDelivered } from "./ai-employee-engagement-session.js";

/** @deprecated Conversation-scoped welcome marker — not used for WhatsApp welcome gating. */
export const AI_EMPLOYEE_WELCOME_DELIVERED_AT_KEY = "welcomeDeliveredAt";

/** @deprecated Conversation-scoped welcome marker — not used for WhatsApp welcome gating. */
export function readWelcomeDeliveredAt(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const value = metadata?.[AI_EMPLOYEE_WELCOME_DELIVERED_AT_KEY];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** @deprecated Conversation-scoped welcome marker — not used for WhatsApp welcome gating. */
export function buildWelcomeDeliveredMetadataPatch(deliveredAt?: string): Record<string, unknown> {
  return {
    [AI_EMPLOYEE_WELCOME_DELIVERED_AT_KEY]: deliveredAt ?? new Date().toISOString(),
  };
}

export function shouldAttemptWhatsAppDeterministicWelcome(input: {
  engagement: AiEmployeeEngagementState | null;
}): boolean {
  if (!input.engagement) return false;
  return !hasEngagementWelcomeDelivered(input.engagement);
}
