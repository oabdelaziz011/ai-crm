/**
 * Pure helpers for the send-requests confirm dialog.
 * Separates approve vs reject so UI regressions (click-through) are testable.
 */

export type QuoteSendConfirmType = "approve" | "reject";

export type QuoteSendConfirmAction<TItem> = {
  type: QuoteSendConfirmType;
  item: TItem;
};

/** Capture the confirm payload before clearing dialog state. */
export function takeConfirmAction<TItem>(
  confirm: QuoteSendConfirmAction<TItem> | null,
): QuoteSendConfirmAction<TItem> | null {
  return confirm;
}

/**
 * Dialog copy must treat only an explicit reject action as reject.
 * `confirm?.type === "approve" ? … : reject` flips to Reject while confirm is null
 * during the close animation — that was the Approve→Reject UX bug.
 */
export function isRejectConfirmAction(
  confirm: { type: QuoteSendConfirmType } | null | undefined,
): boolean {
  return confirm?.type === "reject";
}

/**
 * After the confirm dialog closes, keep the card surface locked briefly so the
 * same pointer event cannot hit Approve/Reject underneath (Radix AlertDialog click-through).
 */
/** Long enough to absorb post-dialog ghost clicks; short enough not to feel stuck. */
export const QUOTE_SEND_CONFIRM_SURFACE_LOCK_MS = 600;

export function shouldLockSendRequestCards(input: {
  confirmOpen: boolean;
  surfaceLocked: boolean;
  busyQuoteId: string | null;
}): boolean {
  return input.confirmOpen || input.surfaceLocked || Boolean(input.busyQuoteId);
}
