/**
 * Central source of truth for customer-initiated sales order cancellation.
 * Consumed by AI core instructions, tool descriptions, and server eligibility logic.
 */

export const ORDER_CANCELLATION_POLICY_VERSION = "2026-11-28.1";

export const DIRECT_CANCEL_STATUSES = ["pending_approval", "confirmed"] as const;
export const REQUEST_CANCEL_STATUSES = ["processing", "out_for_delivery"] as const;
export const ACTIVE_ORDER_STATUSES_FOR_CANCEL = [
  ...DIRECT_CANCEL_STATUSES,
  ...REQUEST_CANCEL_STATUSES,
] as const;
export const NON_CANCELLABLE_STATUSES = ["delivered", "draft"] as const;

export type DirectCancelStatus = (typeof DIRECT_CANCEL_STATUSES)[number];
export type RequestCancelStatus = (typeof REQUEST_CANCEL_STATUSES)[number];

export type CancellationEligibilityCode =
  | "direct_cancel"
  | "request_required"
  | "already_cancelled"
  | "not_allowed_delivered"
  | "not_allowed_status"
  | "pending_request_exists";

export function classifyCancellationEligibility(
  status: string,
  hasPendingRequest: boolean,
): {
  code: CancellationEligibilityCode;
  path: "direct" | "request" | "none";
  customerMessageKey: string;
} {
  if (status === "cancelled") {
    return {
      code: "already_cancelled",
      path: "none",
      customerMessageKey: "already_cancelled",
    };
  }
  if (hasPendingRequest) {
    return {
      code: "pending_request_exists",
      path: "none",
      customerMessageKey: "pending_request_exists",
    };
  }
  if ((DIRECT_CANCEL_STATUSES as readonly string[]).includes(status)) {
    return {
      code: "direct_cancel",
      path: "direct",
      customerMessageKey: "direct_cancel_confirm",
    };
  }
  if ((REQUEST_CANCEL_STATUSES as readonly string[]).includes(status)) {
    return {
      code: "request_required",
      path: "request",
      customerMessageKey: "request_cancel_confirm",
    };
  }
  if (status === "delivered") {
    return {
      code: "not_allowed_delivered",
      path: "none",
      customerMessageKey: "delivered_not_allowed",
    };
  }
  return {
    code: "not_allowed_status",
    path: "none",
    customerMessageKey: "status_not_allowed",
  };
}

/** Compact policy block injected into AI employee system instructions. */
export const ORDER_CANCELLATION_AI_POLICY = [
  `ORDER CANCELLATION POLICY v${ORDER_CANCELLATION_POLICY_VERSION}`,
  "Recognize cancellation intent in Arabic (e.g. عايز ألغي الأوردر، مش محتاج الأوردر، متبعتوش الأوردر) and English (cancel/stop/don't deliver my order). Intent alone never cancels.",
  "Identify the customer's order via list_customer_orders_for_cancellation / get_order_cancellation_eligibility. Never trust an order number as ownership proof — ownership is verified server-side against conversation customer phone/id.",
  "One active order: show number, total, status, and what will happen, then ask for explicit confirmation. Multiple: ask which order. None: ask for order number carefully without leaking other customers' data.",
  "pending_approval or confirmed → after explicit confirmation call confirm_order_cancellation (customerConfirmed=true) for direct cancel.",
  "processing or out_for_delivery → after confirmation create a cancellation REQUEST (not a final cancel). Tell the customer a teammate must approve. Never say the order is cancelled until backend status is cancelled.",
  "delivered → explain this workflow cannot cancel delivered orders. cancelled → say already cancelled (idempotent); do not create duplicates.",
  "Cancellation reason is optional — ask once if natural; never block if the customer declines; pass null when omitted; never invent a reason.",
  "Never promise refunds or that money was returned. Never expose internal notes, notifications, or other companies' data.",
  "If tools return order_state_changed / cancellation_not_allowed / ownership_verification_required, explain the actual tool result only.",
  "A cancelled order is not active — do not offer cancel again as if it were open.",
  "Worker WhatsApp and internal alerts are server-side; do not claim they were delivered unless the tool says so.",
].join("\n");

export const ORDER_CANCELLATION_TOOL_INSTRUCTION =
  "Use the structured code/result from this tool only. " +
  "Never tell the customer the order is cancelled unless code is cancellation_completed or cancellation_already_completed. " +
  "For cancellation_request_created, say the request is pending employee review. " +
  "Never invent refunds, approvals, or WhatsApp delivery.";
