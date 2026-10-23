/**
 * Loads WhatsApp replies left in preparing/dispatching and asks the channel-platform
 * tick to confirm them or mark them for review. The tick never sends.
 * Stays off unless WHATSAPP_REPLY_RECOVERY_WORKER_ENABLED is set.
 */
import {
  isWhatsAppReplyRecoveryWorkerEnabled,
  startWhatsAppReplyRecoveryWorker,
  toStuckWhatsAppReply,
  type StuckWhatsAppReply,
  type StuckWhatsAppReplyDecision,
  type WhatsAppReplyRecoveryWorkerHandle,
} from "@workspace/channel-platform";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";

const BATCH_LIMIT = 25;

type OutgoingRow = {
  id: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  conversation_id: string;
};

type DeliveryRow = {
  delivery_status: string | null;
  external_message_id: string | null;
};

function pickDelivery(rows: DeliveryRow[]): DeliveryRow | null {
  const accepted = rows.find((row) =>
    ["sent", "delivered", "read"].includes(String(row.delivery_status ?? "").toLowerCase()),
  );
  if (accepted) return accepted;
  return rows.find((row) => String(row.delivery_status ?? "").toLowerCase() === "pending") ?? rows[0] ?? null;
}

export async function loadStuckWhatsAppReplies(nowMs = Date.now()): Promise<StuckWhatsAppReply[]> {
  const { client } = getWebhookPlatform();
  const { data, error } = await client
    .from("conversation_messages")
    .select("id, content, metadata, created_at, conversation_id")
    .eq("message_type", "outgoing")
    .or("metadata->>outboundPhase.eq.preparing,metadata->>outboundPhase.eq.dispatching")
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (error) throw error;

  const stuck: StuckWhatsAppReply[] = [];
  for (const row of (data ?? []) as OutgoingRow[]) {
    const deliveries = await client
      .from("channel_delivery_events")
      .select("delivery_status, external_message_id")
      .eq("outbound_message_id", row.id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (deliveries.error) throw deliveries.error;
    const chosen = pickDelivery((deliveries.data ?? []) as DeliveryRow[]);
    const newer = await client
      .from("conversation_messages")
      .select("id")
      .eq("conversation_id", row.conversation_id)
      .eq("message_type", "incoming")
      .gt("created_at", row.created_at)
      .limit(1);
    if (newer.error) throw newer.error;
    stuck.push(
      toStuckWhatsAppReply({
        id: row.id,
        content: row.content,
        createdAt: row.created_at,
        metadata: row.metadata,
        deliveryStatus: chosen?.delivery_status ?? null,
        externalMessageId: chosen?.external_message_id ?? null,
        hasNewerInbound: (newer.data ?? []).length > 0,
        nowMs,
      }),
    );
  }
  return stuck;
}

export async function saveWhatsAppReplyRecoveryDecision(
  decision: StuckWhatsAppReplyDecision,
): Promise<void> {
  const { client } = getWebhookPlatform();
  const current = await client
    .from("conversation_messages")
    .select("metadata")
    .eq("id", decision.messageId)
    .maybeSingle();
  if (current.error) throw current.error;
  const metadata = {
    ...((current.data?.metadata as Record<string, unknown> | null) ?? {}),
    whatsappRecoveryDisposition: decision.disposition,
    whatsappRecoveryAttempts: decision.attempts,
  };
  const updated = await client
    .from("conversation_messages")
    .update({ metadata })
    .eq("id", decision.messageId);
  if (updated.error) throw updated.error;
}

export function startWhatsAppReplyRecoveryFromPlatform(): WhatsAppReplyRecoveryWorkerHandle | null {
  if (!isWhatsAppReplyRecoveryWorkerEnabled()) return null;
  return startWhatsAppReplyRecoveryWorker({
    listStuck: () => loadStuckWhatsAppReplies(),
    confirm: async (input) => {
      const confirm = getWebhookPlatform().ports.conversation.confirmOutgoingDelivery;
      if (!confirm) throw new Error("confirmOutgoingDelivery is not configured");
      await confirm(input);
    },
    save: saveWhatsAppReplyRecoveryDecision,
    loggerError: (error) => {
      console.error("[whatsapp-reply-recovery] tick failed", error);
    },
  });
}
