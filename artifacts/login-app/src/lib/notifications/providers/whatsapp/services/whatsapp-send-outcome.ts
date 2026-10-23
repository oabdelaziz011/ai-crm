export type WhatsAppQueueFailureDecision =
  | { action: "complete_without_resend"; messageId: string }
  | { action: "hold_without_resend" }
  | { action: "retry_proven_rejection" };

/**
 * Retry only when the provider was not called, or Graph returned an error and no message id.
 * An accepted id, a missing id, or a transport error that is not a Graph rejection must not be sent again.
 */
export function decideWhatsAppQueueFailure(input: {
  providerAttempted: boolean;
  acceptedMessageId?: string | null;
  confirmedRejection: boolean;
}): WhatsAppQueueFailureDecision {
  const acceptedMessageId = input.acceptedMessageId?.trim() ?? "";
  if (acceptedMessageId) {
    return { action: "complete_without_resend", messageId: acceptedMessageId };
  }
  if (!input.providerAttempted || input.confirmedRejection) {
    return { action: "retry_proven_rejection" };
  }
  return { action: "hold_without_resend" };
}
