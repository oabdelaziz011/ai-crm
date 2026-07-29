import type { ConversationRecord } from "@workspace/ai-conversation";

type CustomerListFields = {
  name: string;
  phone: string | null;
};

export type ConversationListDisplay = {
  customerName: string | null;
  customerPhone: string | null;
  preview: string | null;
};

/**
 * Agent-facing Team Inbox row labels. No internal identifiers (CNV-xxxxx).
 */
export function buildConversationListDisplay(
  conversation: ConversationRecord,
  customer?: CustomerListFields | null,
): ConversationListDisplay {
  return {
    customerName: customer?.name?.trim() || null,
    customerPhone: customer?.phone?.trim() || null,
    preview: conversation.last_message_preview?.trim() || null,
  };
}

export function inboxChannelLabel(channelType: string): string {
  if (channelType === "whatsapp") return "WhatsApp";
  if (channelType === "facebook") return "Facebook";
  if (channelType === "messenger") return "Messenger";
  if (channelType === "instagram") return "Instagram";
  if (channelType === "sms") return "SMS";
  if (channelType === "email") return "Email";
  return channelType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function inboxChannelBadgeClass(channelType: string): string {
  switch (channelType) {
    case "whatsapp":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/35";
    case "facebook":
    case "messenger":
      return "bg-blue-500/15 text-blue-300 border-blue-500/35";
    case "instagram":
      return "bg-pink-500/15 text-pink-300 border-pink-500/35";
    case "sms":
      return "bg-violet-500/15 text-violet-300 border-violet-500/35";
    case "email":
      return "bg-amber-500/15 text-amber-300 border-amber-500/35";
    default:
      return "bg-white/8 text-foreground/80 border-white/15";
  }
}
