/**
 * Shared decision for automatic qualification after a customer message.
 * Public website chat and human-owned conversations never qualify.
 * A stored widget channel is authoritative even when the page flag is absent.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Must match the public web widget provider. A client-supplied flag cannot replace this. */
export const PUBLIC_WEB_WIDGET_PROVIDER = "valueor.web_widget";

export function shouldApplyAutomaticSalesQualification(input: {
  pageContext?: Record<string, unknown> | null;
  /** True when the conversation row is the public web widget. */
  publicWebChatConversation?: boolean;
  gateAllowsAutomatedReply: boolean;
}): { apply: boolean; reason: string } {
  if (input.publicWebChatConversation === true || input.pageContext?.publicWebChat === true) {
    return { apply: false, reason: "public_web_chat" };
  }
  if (!input.gateAllowsAutomatedReply) {
    return { apply: false, reason: "human_or_paused_ownership" };
  }
  return { apply: true, reason: "eligible" };
}

function messageKey(conversationId: string, correlationId: string | undefined, messageText: string): string {
  const correlation = correlationId?.trim();
  if (correlation) return correlation;
  let hash = 0;
  for (let index = 0; index < messageText.length; index += 1) {
    hash = (hash * 31 + messageText.charCodeAt(index)) >>> 0;
  }
  return `turn:${conversationId}:${hash.toString(16)}`;
}

export async function qualifyOpenLeadFromCustomerTurn(input: {
  companyId: string;
  conversationId: string;
  messageText: string;
  correlationId?: string;
  pageContext?: Record<string, unknown> | null;
  publicWebChatConversation?: boolean;
  actorUserId: string | null;
  gateAllowsAutomatedReply: boolean;
  loadCustomerTexts: () => Promise<string[]>;
  findLeadId: () => Promise<string | null>;
  apply: (lead: { leadId: string; messageId: string; texts: string[] }) => Promise<void>;
}): Promise<"skipped" | "no_lead" | "applied"> {
  const decision = shouldApplyAutomaticSalesQualification({
    pageContext: input.pageContext,
    publicWebChatConversation: input.publicWebChatConversation,
    gateAllowsAutomatedReply: input.gateAllowsAutomatedReply,
  });
  if (!decision.apply || !input.actorUserId) return "skipped";
  const leadId = await input.findLeadId();
  if (!leadId) return "no_lead";
  const history = await input.loadCustomerTexts();
  const texts = [...history, input.messageText].map((text) => text.slice(0, 500)).filter((text) => text.trim());
  await input.apply({
    leadId,
    messageId: messageKey(input.conversationId, input.correlationId, input.messageText),
    texts,
  });
  return "applied";
}

/**
 * Trusted public-chat identity from conversations + company_channels, scoped to the company.
 * Throws when the lookup fails so the caller can skip qualification (fail closed).
 */
export async function conversationIsPublicWebWidget(
  client: SupabaseClient,
  companyId: string,
  conversationId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("conversations")
    .select("channel_type, company_channel_id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || String(data.channel_type ?? "") !== "web_chat" || !data.company_channel_id) return false;
  const channel = await client
    .from("company_channels")
    .select("provider")
    .eq("id", String(data.company_channel_id))
    .eq("company_id", companyId)
    .maybeSingle();
  if (channel.error) throw new Error(channel.error.message);
  return String(channel.data?.provider ?? "") === PUBLIC_WEB_WIDGET_PROVIDER;
}
