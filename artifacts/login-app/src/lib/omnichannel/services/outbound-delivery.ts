import type { ConversationMessageRecord, MessageStatus } from "@workspace/ai-conversation";
import {
  validateOutboundRoute as validateOutboundRouteShared,
  type ChannelSessionRow,
  type OutboundRouteIssue,
  type OutboundRouteIssueCode,
  type OutboundRouteTarget,
} from "@workspace/channel-platform/client";

export type OutboundDeliveryPhase =
  | "draft"
  | "preparing"
  | "dispatching"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "pending_retry";

export type OutboundSendError = {
  code: OutboundRouteIssueCode | "dispatch_failed" | "send_failed";
  message: string;
  detail?: string;
};

export type { ChannelSessionRow, OutboundRouteIssue, OutboundRouteIssueCode, OutboundRouteTarget };

export const OUTBOUND_METADATA = {
  optimistic: "optimistic",
  outboundPhase: "outboundPhase",
  dispatchConfirmed: "dispatchConfirmed",
  dispatchFailed: "dispatchFailed",
  dispatchError: "dispatchError",
} as const;

const CONFIRMED_DELIVERY_STATUSES = new Set<MessageStatus>(["sent", "delivered", "read"]);

export const validateOutboundRoute = validateOutboundRouteShared;

export function isOutboundDispatchConfirmed(message: ConversationMessageRecord): boolean {
  if (message.message_type !== "outgoing") return false;
  if (message.metadata?.[OUTBOUND_METADATA.dispatchConfirmed] === true) return true;
  if (typeof message.external_message_id === "string" && message.external_message_id.trim().length > 0) {
    return true;
  }
  if (message.status === "delivered" || message.status === "read") return true;
  return false;
}

export function resolveOutboundDeliveryPhase(message: ConversationMessageRecord): OutboundDeliveryPhase {
  if (message.message_type !== "outgoing") return "sent";

  const metadata = message.metadata ?? {};
  const explicitPhase = metadata[OUTBOUND_METADATA.outboundPhase];
  if (
    explicitPhase === "draft"
    || explicitPhase === "preparing"
    || explicitPhase === "dispatching"
    || explicitPhase === "sent"
    || explicitPhase === "delivered"
    || explicitPhase === "read"
    || explicitPhase === "failed"
    || explicitPhase === "pending_retry"
  ) {
    if (explicitPhase === "sent" && !isOutboundDispatchConfirmed(message)) {
      return metadata[OUTBOUND_METADATA.dispatchFailed] ? "failed" : "dispatching";
    }
    return explicitPhase;
  }

  if (metadata[OUTBOUND_METADATA.dispatchFailed] || message.status === "failed") {
    return "failed";
  }

  if (message.status === "read") return isOutboundDispatchConfirmed(message) ? "read" : "dispatching";
  if (message.status === "delivered") return isOutboundDispatchConfirmed(message) ? "delivered" : "dispatching";
  if (message.status === "sent") return isOutboundDispatchConfirmed(message) ? "sent" : "dispatching";
  if (message.status === "pending") {
    return metadata[OUTBOUND_METADATA.optimistic] ? "preparing" : "preparing";
  }

  return "preparing";
}

export function shouldDisplayOutboundDeliveryPhase(phase: OutboundDeliveryPhase): boolean {
  return phase !== "draft";
}

export function isConfirmedDeliveryPhase(phase: OutboundDeliveryPhase): boolean {
  return phase === "sent" || phase === "delivered" || phase === "read";
}

export function mapDispatchResponseToMessageStatus(deliveryStatus: string | undefined): MessageStatus {
  const normalized = deliveryStatus?.trim().toLowerCase();
  if (normalized === "delivered") return "delivered";
  if (normalized === "read") return "read";
  if (normalized === "failed") return "failed";
  if (normalized === "pending") return "pending";
  return "sent";
}

export function buildOutboundSendError(issue: OutboundRouteIssue): OutboundSendError {
  return {
    code: issue.code,
    message: issue.message,
  };
}

export function channelSettingsHref(companyChannelId: string | null | undefined): string {
  if (companyChannelId) return `/dashboard/channels?channelId=${encodeURIComponent(companyChannelId)}`;
  return "/dashboard/channels";
}

export function channelDiagnosticsHref(companyChannelId: string | null | undefined): string {
  if (companyChannelId) {
    return `/dashboard/channels?channelId=${encodeURIComponent(companyChannelId)}&diagnostics=1`;
  }
  return "/dashboard/channels?diagnostics=1";
}

export function readDispatchConfirmedStatus(
  message: ConversationMessageRecord,
): MessageStatus | null {
  if (!CONFIRMED_DELIVERY_STATUSES.has(message.status)) return null;
  return isOutboundDispatchConfirmed(message) ? message.status : null;
}
