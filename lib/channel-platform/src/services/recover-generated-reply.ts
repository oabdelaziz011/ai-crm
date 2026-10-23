import {
  retryUnconfirmedOutgoingConfirmation,
  type ConfirmOutgoingDeliveryFn,
} from "./confirm-outgoing-delivery.js";

const PROVIDER_ACCEPTED_DELIVERY_STATUSES = new Set(["sent", "delivered", "read"]);

export type GeneratedReplyRecoveryResult =
  | {
      action: "confirm_only";
      confirmed: boolean;
      attempts: number;
      reason?: "already_confirmed" | "confirmation_failed" | "confirmation_unavailable";
    }
  | {
      action: "skip";
      reason: "no_durable_reply" | "newer_turn" | "delivery_pending" | "acceptance_unconfirmed";
    };

/**
 * Decide what can be done with a reply that was generated before a crash.
 * Confirms storage only when the provider accepted the message.
 * Acceptance is a sent/delivered/read row, or any row that already has a provider message id.
 * Never sends, and never runs the model again.
 * Missing delivery, pending without an id, and failed without an id are not a reason to send again.
 */
export async function recoverGeneratedReply(
  input: {
    replyText?: string | null;
    outboundPhase?: string | null;
    deliveryStatus?: string | null;
    hasNewerInbound: boolean;
    messageId?: string | null;
    externalMessageId?: string | null;
  },
  confirm?: ConfirmOutgoingDeliveryFn,
): Promise<GeneratedReplyRecoveryResult> {
  const deliveryStatus = (input.deliveryStatus ?? "").trim().toLowerCase();
  const storedProviderId = (input.externalMessageId ?? "").trim();
  const statusSaysAccepted = PROVIDER_ACCEPTED_DELIVERY_STATUSES.has(deliveryStatus);
  // A stored provider id means the provider already accepted, even if the sent write never landed.
  const providerAccepted = statusSaysAccepted || storedProviderId.length > 0;

  if (providerAccepted) {
    if (!confirm || !input.messageId?.trim()) {
      return { action: "confirm_only", confirmed: false, attempts: 0, reason: "confirmation_unavailable" };
    }
    const result = await retryUnconfirmedOutgoingConfirmation(confirm, {
      messageId: input.messageId,
      deliveryStatus: statusSaysAccepted ? deliveryStatus : "sent",
      externalMessageId: storedProviderId || null,
      outboundPhase: input.outboundPhase,
    });
    if (!result.attempted) {
      return {
        action: "confirm_only",
        confirmed: false,
        attempts: 0,
        reason: "already_confirmed",
      };
    }
    if (!result.ok) {
      return {
        action: "confirm_only",
        confirmed: false,
        attempts: result.attempts,
        reason: "confirmation_failed",
      };
    }
    return { action: "confirm_only", confirmed: true, attempts: result.attempts };
  }

  if (input.hasNewerInbound) {
    return { action: "skip", reason: "newer_turn" };
  }
  if (!(input.replyText ?? "").trim()) {
    return { action: "skip", reason: "no_durable_reply" };
  }
  if (deliveryStatus === "pending") {
    return { action: "skip", reason: "delivery_pending" };
  }
  return { action: "skip", reason: "acceptance_unconfirmed" };
}
