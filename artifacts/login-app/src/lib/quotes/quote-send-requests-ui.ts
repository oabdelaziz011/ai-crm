/**
 * Pure UI state helpers for the quote send-request inbox.
 */

export type QuoteSendRequestsInboxState =
  | "forbidden"
  | "loading"
  | "error"
  | "empty"
  | "ready";

export function resolveQuoteSendRequestsInboxState(input: {
  canSend: boolean;
  isLoading: boolean;
  hasError: boolean;
  itemCount: number;
}): QuoteSendRequestsInboxState {
  if (!input.canSend) return "forbidden";
  if (input.isLoading) return "loading";
  if (input.hasError) return "error";
  if (input.itemCount <= 0) return "empty";
  return "ready";
}

/** Never treat a pending request or bare approve click as "sent". */
export function quoteSendRequestDeliveryLabelKey(
  item: { deliveryState?: string; sent?: boolean },
  approveResult?: { sent?: boolean; deliveryState?: string } | null,
): string {
  if (approveResult?.sent === true || approveResult?.deliveryState === "sent") {
    return "quotes.sendRequests.status.sent";
  }
  if (approveResult?.deliveryState === "failed") {
    return "quotes.sendRequests.status.failed";
  }
  if (item.sent === true) return "quotes.sendRequests.status.sent";
  return "quotes.sendRequests.status.pending_human_approval";
}
