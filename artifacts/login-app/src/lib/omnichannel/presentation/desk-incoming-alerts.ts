/**
 * Inbound channel toast + in-app bell persistence.
 * Toast disappears after a few seconds; the bell row stays until the user opens it.
 */
import i18n from "@/i18n";
import { toast } from "@/hooks/use-toast";
import { getNotificationServices } from "@/lib/notifications";
import { playDeskNotificationSound } from "@/lib/omnichannel/presentation/desk-notification-sound";

export type InboundChannelKind = "whatsapp" | "email" | "sms" | "instagram" | "messenger" | "omnichannel";

const FLASH_EVENT = "desk:incoming-customer-flash";
const DEDUP_TTL_MS = 60_000;
const recentKeys = new Map<string, number>();

export type DeskIncomingFlashDetail = {
  conversationId: string;
};

function pruneDedup(now: number) {
  for (const [key, at] of recentKeys) {
    if (now - at > DEDUP_TTL_MS) recentKeys.delete(key);
  }
}

function shouldEmit(dedupeKey: string): boolean {
  const now = Date.now();
  pruneDedup(now);
  if (recentKeys.has(dedupeKey)) return false;
  recentKeys.set(dedupeKey, now);
  return true;
}

function channelLabel(channel: InboundChannelKind): string {
  const key = `notifications.inbound.channels.${channel}`;
  if (i18n.exists(key)) return i18n.t(key);
  return channel;
}

function toastCopy(channel: InboundChannelKind, preview?: string): { title: string; description: string } {
  const titleKey = "notifications.inbound.toastTitle";
  const bodyKey = "notifications.inbound.toastBody";
  const channelName = channelLabel(channel);
  return {
    title: i18n.exists(titleKey)
      ? i18n.t(titleKey, { channel: channelName })
      : `New ${channelName} message`,
    description: preview?.trim()
      ? preview.trim().slice(0, 140)
      : i18n.exists(bodyKey)
        ? i18n.t(bodyKey, { channel: channelName })
        : `You received a new ${channelName} message`,
  };
}

function navigationTarget(channel: InboundChannelKind, conversationId: string): string {
  const id = encodeURIComponent(conversationId);
  if (channel === "email") return `/dashboard/email?conversation=${id}`;
  if (channel === "sms") return `/dashboard/sms?conversation=${id}`;
  return `/dashboard/omnichannel?conversation=${id}`;
}

/**
 * Presentation alert for a new customer message in a non-focused conversation.
 * Sound + flash + toast + persisted in-app notification (when auth context is available).
 */
export function notifyDeskIncomingCustomerAlert(
  conversationId: string,
  focusedConversationId: string | null | undefined,
  options?: {
    channel?: InboundChannelKind;
    messageId?: string | null;
    companyId?: string | null;
    userId?: string | null;
    preview?: string | null;
    persist?: boolean;
  },
): void {
  if (!conversationId) return;
  if (focusedConversationId && conversationId === focusedConversationId) return;

  const channel = options?.channel ?? "omnichannel";
  const dedupeKey = `${channel}:${options?.messageId?.trim() || conversationId}`;
  if (!shouldEmit(dedupeKey)) return;

  playDeskNotificationSound();
  window.dispatchEvent(
    new CustomEvent<DeskIncomingFlashDetail>(FLASH_EVENT, {
      detail: { conversationId },
    }),
  );

  const copy = toastCopy(channel, options?.preview ?? undefined);
  const shown = toast({
    title: copy.title,
    description: copy.description,
  });
  window.setTimeout(() => shown.dismiss(), 6_000);

  if (options?.persist === false) return;
  const companyId = options?.companyId?.trim();
  const userId = options?.userId?.trim();
  if (!companyId || !userId) return;

  void getNotificationServices()
    .notifications.createNotification({
      companyId,
      event: "generic_system",
      userId,
      recipients: [{ userId, companyId }],
      channels: ["in_app"],
      priority: "high",
      params: {
        // Stable English title — localized at render via notification-i18n.
        title: "New inbound message",
        // Prefer live preview only; never persist toast boilerplate (it freezes one language).
        detail: options?.preview?.trim().slice(0, 140) || "",
        body: "",
        conversationId,
        messageId: options?.messageId ?? "",
        channel,
        channelType: channel,
        entityType: "conversation",
        entityId: conversationId,
        navigationTarget: navigationTarget(channel, conversationId),
      },
    })
    .catch(() => {
      // Toast already shown; bell persistence is best-effort.
    });
}

export function subscribeDeskIncomingFlash(
  listener: (conversationId: string) => void,
): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<DeskIncomingFlashDetail>).detail;
    if (detail?.conversationId) listener(detail.conversationId);
  };
  window.addEventListener(FLASH_EVENT, handler);
  return () => window.removeEventListener(FLASH_EVENT, handler);
}

/** @deprecated Prefer notifyDeskIncomingCustomerAlert — kept for import compatibility. */
export { notifyDeskIncomingCustomerAlert as notifyInboundChannelAlert };
