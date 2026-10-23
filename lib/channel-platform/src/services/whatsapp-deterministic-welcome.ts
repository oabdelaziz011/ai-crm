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

/**
 * Pure greetings that are fully covered by the configured deterministic welcome.
 * After welcome is delivered on this turn, skip a second AI greeting reply.
 */
/** Later pure greetings still get a reply. They do not open a booking. */
export function greetingFollowUpReply(text: string): string {
  const trimmed = text.trim();
  if (/مساء/u.test(trimmed)) return "مساء الفل، أهلاً بيك. تحب أساعدك في إيه؟";
  if (/صباح/u.test(trimmed)) return "صباح النور، أهلاً بيك. تحب أساعدك في إيه؟";
  return "أهلاً بيك. تحب أساعدك في إيه؟";
}

export function isGreetingOnlyInboundText(text: string | null | undefined): boolean {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed || trimmed.length > 48) return false;
  return /^(?:(?:مساء|صباح)\s*(?:الخير|النور|الفل|الورد)|السلام\s*عليكم(?:\s*ورحمة\s*الله(?:\s*وبركاته)?)?|سلام|أهلاً?(?:\s*بك)?|اهلا(?:\s*بيك)?|مرحبا(?:ً)?|هاي|hello|hi|hey)[!!.؟?\s]*$/iu.test(
    trimmed,
  );
}
