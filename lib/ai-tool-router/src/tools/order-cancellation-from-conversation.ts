import {
  ACTIVE_ORDER_STATUSES_FOR_CANCEL,
  classifyCancellationEligibility,
  ORDER_CANCELLATION_TOOL_INSTRUCTION,
} from "./order-cancellation-policy.js";
import type { SalesOrderToolPorts } from "./sales-order-ports.js";

export type CancellationToolResult = {
  success: boolean;
  code: string;
  reason?: string;
  instruction: string;
  orders?: Array<Record<string, unknown>>;
  order?: Record<string, unknown>;
  eligibility?: Record<string, unknown>;
  requestId?: string;
  path?: string;
};

function ok(
  code: string,
  extra: Omit<CancellationToolResult, "success" | "code" | "instruction"> = {},
): CancellationToolResult {
  return { success: true, code, instruction: ORDER_CANCELLATION_TOOL_INSTRUCTION, ...extra };
}

function fail(
  code: string,
  reason: string,
  extra: Omit<CancellationToolResult, "success" | "code" | "instruction" | "reason"> = {},
): CancellationToolResult {
  return {
    success: false,
    code,
    reason,
    instruction: ORDER_CANCELLATION_TOOL_INSTRUCTION,
    ...extra,
  };
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "").trim();
}

export async function listCustomerOrdersForCancellation(
  ports: SalesOrderToolPorts,
  input: {
    companyId: string;
    conversationId: string;
    customerPhone?: string | null;
    orderNumber?: string | null;
  },
): Promise<CancellationToolResult> {
  const phone =
    normalizePhone(input.customerPhone ?? "") ||
    (await ports.resolveConversationCustomerPhone?.({
      companyId: input.companyId,
      conversationId: input.conversationId,
    })) ||
    "";
  if (!phone) {
    return fail("ownership_verification_required", "Customer phone is required to list orders safely.");
  }

  const orders = await ports.listCustomerActiveOrders({
    companyId: input.companyId,
    customerPhone: phone,
    orderNumber: input.orderNumber?.trim() || null,
    statuses: [...ACTIVE_ORDER_STATUSES_FOR_CANCEL, "cancelled", "delivered"],
  });

  const owned = orders.filter((o) => normalizePhone(o.customerPhone) === phone);
  if (input.orderNumber?.trim() && owned.length === 0) {
    return fail("order_not_found", "No matching order found for this customer.");
  }
  if (owned.length === 0) {
    return fail("order_not_found", "No eligible orders found for this customer.", { orders: [] });
  }

  return ok("orders_listed", {
    orders: owned.map((o) => ({
      orderId: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      totalAmount: o.totalAmount,
      currency: o.currency,
      customerName: o.customerName,
      hasPendingCancellationRequest: o.hasPendingCancellationRequest,
      latestRejectionReason: o.latestRejectionReason ?? null,
    })),
  });
}

export async function getOrderCancellationEligibility(
  ports: SalesOrderToolPorts,
  input: {
    companyId: string;
    conversationId: string;
    orderId?: string | null;
    orderNumber?: string | null;
    customerPhone?: string | null;
  },
): Promise<CancellationToolResult> {
  const listed = await listCustomerOrdersForCancellation(ports, {
    companyId: input.companyId,
    conversationId: input.conversationId,
    customerPhone: input.customerPhone,
    orderNumber: input.orderNumber,
  });
  if (!listed.success || !listed.orders?.length) return listed;

  let target = listed.orders[0]!;
  if (input.orderId) {
    const match = listed.orders.find((o) => o.orderId === input.orderId);
    if (!match) return fail("order_not_found", "Order not found for this customer.");
    target = match;
  } else if (!input.orderNumber && listed.orders.length > 1) {
    const active = listed.orders.filter((o) =>
      (ACTIVE_ORDER_STATUSES_FOR_CANCEL as readonly string[]).includes(String(o.status)),
    );
    if (active.length > 1) {
      return ok("multiple_orders", {
        reason: "Multiple active orders — ask the customer which order number to cancel.",
        orders: active,
      });
    }
    if (active.length === 1) target = active[0]!;
  }

  const eligibility = classifyCancellationEligibility(
    String(target.status),
    Boolean(target.hasPendingCancellationRequest),
  );

  if (
    eligibility.path !== "none" &&
    target.latestRejectionReason &&
    !target.hasPendingCancellationRequest
  ) {
    return ok("cancellation_rejected", {
      order: target,
      reason: String(target.latestRejectionReason),
      eligibility: {
        path: eligibility.path,
        code: "cancellation_rejected",
        requiresEmployeeApproval: eligibility.path === "request",
        reasonOptional: true,
        refundNotAutomatic: true,
        canRequestAgain: true,
      },
      path: eligibility.path,
    });
  }

  return ok(eligibility.code, {
    order: target,
    eligibility: {
      path: eligibility.path,
      code: eligibility.code,
      requiresEmployeeApproval: eligibility.path === "request",
      reasonOptional: true,
      refundNotAutomatic: true,
    },
    path: eligibility.path,
  });
}

export async function confirmOrderCancellation(
  ports: SalesOrderToolPorts,
  input: {
    companyId: string;
    conversationId: string;
    orderId: string;
    customerConfirmed: boolean;
    customerPhone?: string | null;
    reason?: string | null;
  },
): Promise<CancellationToolResult> {
  if (!input.customerConfirmed) {
    return fail(
      "confirmation_required",
      "Explicit customerConfirmed=true is required. Do not cancel or create a request.",
    );
  }

  const eligibility = await getOrderCancellationEligibility(ports, {
    companyId: input.companyId,
    conversationId: input.conversationId,
    orderId: input.orderId,
    customerPhone: input.customerPhone,
  });
  if (eligibility.code === "multiple_orders") return eligibility;
  if (eligibility.code === "already_cancelled") {
    return ok("cancellation_already_completed", { order: eligibility.order });
  }
  if (eligibility.code === "pending_request_exists") {
    return ok("cancellation_request_created", {
      order: eligibility.order,
      reason: "A cancellation request is already pending employee review.",
      path: "request",
    });
  }
  if (
    eligibility.code === "not_allowed_delivered" ||
    eligibility.code === "not_allowed_status" ||
    eligibility.code === "order_not_found" ||
    eligibility.code === "ownership_verification_required"
  ) {
    return fail(
      eligibility.code === "order_not_found" || eligibility.code === "ownership_verification_required"
        ? eligibility.code
        : "cancellation_not_allowed",
      eligibility.reason || "Cancellation not allowed for this status.",
      { order: eligibility.order },
    );
  }
  if (!eligibility.order) {
    return fail("order_not_found", "Order not found for this customer.");
  }

  const reason = input.reason?.trim() ? input.reason.trim().slice(0, 500) : null;
  // Prior employee rejection (cancellation_rejected) still allows a new confirm when path is set.
  const path = eligibility.path;

  if (path === "direct") {
    const result = await ports.executeCustomerDirectCancellation({
      companyId: input.companyId,
      conversationId: input.conversationId,
      orderId: String(eligibility.order.orderId),
      reason,
      customerPhone: input.customerPhone,
    });
    if (!result.ok) {
      return fail(result.code, result.reason, { order: eligibility.order });
    }
    if (result.workerNotify && ports.notifyCancellationWorkerWhatsApp) {
      try {
        await ports.notifyCancellationWorkerWhatsApp({
          companyId: input.companyId,
          orderId: String(eligibility.order.orderId),
          ...result.workerNotify,
        });
      } catch {
        /* WhatsApp failure must never undo cancellation */
      }
    }
    return ok("cancellation_completed", {
      order: { ...eligibility.order, status: "cancelled" },
      path: "direct",
    });
  }

  if (path === "request") {
    const result = await ports.createCustomerCancellationRequest({
      companyId: input.companyId,
      conversationId: input.conversationId,
      orderId: String(eligibility.order.orderId),
      reason,
    });
    if (!result.ok) {
      return fail(result.code, result.reason, { order: eligibility.order });
    }
    return ok("cancellation_request_created", {
      order: eligibility.order,
      requestId: result.requestId,
      path: "request",
    });
  }

  return fail("cancellation_not_allowed", "No cancellation path for this order.");
}
