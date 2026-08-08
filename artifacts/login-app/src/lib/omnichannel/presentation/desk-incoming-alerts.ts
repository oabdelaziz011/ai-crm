import { playDeskNotificationSound } from "@/lib/omnichannel/presentation/desk-notification-sound";

const FLASH_EVENT = "desk:incoming-customer-flash";

export type DeskIncomingFlashDetail = {
  conversationId: string;
};

/**
 * Presentation alert for a new customer message in a non-focused conversation.
 * Sound + one flash signal (row animates twice, then stops).
 */
export function notifyDeskIncomingCustomerAlert(
  conversationId: string,
  focusedConversationId: string | null | undefined,
): void {
  if (!conversationId) return;
  if (focusedConversationId && conversationId === focusedConversationId) return;

  playDeskNotificationSound();
  window.dispatchEvent(
    new CustomEvent<DeskIncomingFlashDetail>(FLASH_EVENT, {
      detail: { conversationId },
    }),
  );
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
