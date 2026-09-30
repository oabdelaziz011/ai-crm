import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import { supabase } from "@/lib/supabase";
import { dispatchOmnichannelOutboundViaApi } from "@/lib/omnichannel/services/omnichannel-outbound-api-client";
import { resolveChannelSession } from "@/lib/omnichannel/services/channel-session-resolver";

export function readMessageReactionEmoji(
  message: ConversationMessageRecord | { metadata?: Record<string, unknown> | null } | null | undefined,
  prefer: "customer" | "agent" | "any" = "any",
): string | null {
  const metadata = message?.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const reactions = metadata.reactions;
  if (!reactions || typeof reactions !== "object" || Array.isArray(reactions)) return null;

  const readSide = (side: "customer" | "agent"): string | null => {
    const entry = (reactions as Record<string, unknown>)[side];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const emoji = (entry as Record<string, unknown>).emoji;
    return typeof emoji === "string" && emoji.trim() ? emoji.trim() : null;
  };

  if (prefer === "customer") return readSide("customer");
  if (prefer === "agent") return readSide("agent");
  return readSide("customer") ?? readSide("agent");
}

function resolveTargetExternalMessageId(message: ConversationMessageRecord): string | null {
  const fromColumn = message.external_message_id?.trim();
  if (fromColumn) return fromColumn;
  const fromMeta = message.metadata?.externalMessageId;
  return typeof fromMeta === "string" && fromMeta.trim() ? fromMeta.trim() : null;
}

async function patchLocalReactionMetadata(input: {
  messageId: string;
  conversationId: string;
  emoji: string | null;
  from: "customer" | "agent";
}): Promise<void> {
  const { data: existing } = await supabase
    .from("conversation_messages")
    .select("metadata")
    .eq("id", input.messageId)
    .eq("conversation_id", input.conversationId)
    .maybeSingle();

  const existingMeta =
    existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? { ...(existing.metadata as Record<string, unknown>) }
      : {};
  const existingReactions =
    existingMeta.reactions &&
    typeof existingMeta.reactions === "object" &&
    !Array.isArray(existingMeta.reactions)
      ? { ...(existingMeta.reactions as Record<string, unknown>) }
      : {};

  if (!input.emoji) {
    delete existingReactions[input.from];
  } else {
    existingReactions[input.from] = {
      emoji: input.emoji,
      at: new Date().toISOString(),
    };
  }

  await supabase
    .from("conversation_messages")
    .update({
      metadata: {
        ...existingMeta,
        reactions: existingReactions,
      },
    })
    .eq("id", input.messageId)
    .eq("conversation_id", input.conversationId);
}

/**
 * Send a WhatsApp reaction via Meta Graph and persist it on the target message metadata.
 * Does not create a new conversation_messages row.
 */
export async function sendWhatsAppMessageReaction(input: {
  companyId: string;
  conversationId: string;
  message: ConversationMessageRecord;
  emoji: string | null;
}): Promise<void> {
  const targetExternalMessageId = resolveTargetExternalMessageId(input.message);
  if (!targetExternalMessageId) {
    throw new Error("Cannot react: message has no WhatsApp message id yet.");
  }

  const session = await resolveChannelSession(input.conversationId);
  if (!session?.id || !session.company_channel_id || !session.external_thread_id) {
    throw new Error("Cannot react: WhatsApp channel session is missing.");
  }
  if (session.channel_key !== "whatsapp") {
    throw new Error("Reactions are only supported on WhatsApp conversations.");
  }

  const emoji = input.emoji?.trim() ?? "";

  await dispatchOmnichannelOutboundViaApi({
    companyId: input.companyId,
    conversationId: input.conversationId,
    companyChannelId: session.company_channel_id,
    channelKey: "whatsapp",
    channelSessionId: session.id,
    externalThreadId: session.external_thread_id,
    text: "",
    persistConversationMessage: false,
    outboundPayload: {
      kind: "reaction",
      messageId: targetExternalMessageId,
      emoji,
    },
    metadata: {
      source: "omnichannel_reaction",
      conversationMessageId: input.message.id,
    },
  });

  await patchLocalReactionMetadata({
    messageId: input.message.id,
    conversationId: input.conversationId,
    emoji: emoji || null,
    from: "agent",
  });
}
