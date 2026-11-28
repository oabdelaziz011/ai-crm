/**
 * Ownership-safe customer order status lookup for AI Q&A.
 * Reuses listCustomerActiveOrders — does not invent statuses.
 */
import type { SalesOrderToolPorts } from "./sales-order-ports.js";
import { CUSTOMER_ORDER_STATUS_LOOKUP_STATUSES } from "./sales-order-tool-definitions.js";

export const ORDER_STATUS_LOOKUP_INSTRUCTION =
  "Use only statuses returned by the tool. Never invent order numbers, totals, or delivery states. " +
  "If ownership_verification_required or order_not_found, ask the customer for clarification without guessing.";

export type OrderStatusToolResult = {
  success: boolean;
  code: string;
  reason?: string;
  instruction: string;
  orders?: Array<Record<string, unknown>>;
  order?: Record<string, unknown>;
};

function ok(
  code: string,
  extra: Omit<OrderStatusToolResult, "success" | "code" | "instruction"> = {},
): OrderStatusToolResult {
  return { success: true, code, instruction: ORDER_STATUS_LOOKUP_INSTRUCTION, ...extra };
}

function fail(
  code: string,
  reason: string,
  extra: Omit<OrderStatusToolResult, "success" | "code" | "instruction" | "reason"> = {},
): OrderStatusToolResult {
  return {
    success: false,
    code,
    reason,
    instruction: ORDER_STATUS_LOOKUP_INSTRUCTION,
    ...extra,
  };
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "").trim();
}

function mapOrder(o: {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  currency: string;
  customerName: string;
  hasPendingCancellationRequest: boolean;
}): Record<string, unknown> {
  return {
    orderId: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    totalAmount: o.totalAmount,
    currency: o.currency,
    customerName: o.customerName,
    hasPendingCancellationRequest: o.hasPendingCancellationRequest,
  };
}

export async function listCustomerOrders(
  ports: SalesOrderToolPorts,
  input: {
    companyId: string;
    conversationId: string;
    customerPhone?: string | null;
    orderNumber?: string | null;
  },
): Promise<OrderStatusToolResult> {
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
    statuses: [...CUSTOMER_ORDER_STATUS_LOOKUP_STATUSES],
  });

  const owned = orders.filter((o) => normalizePhone(o.customerPhone) === phone);
  if (input.orderNumber?.trim() && owned.length === 0) {
    return fail("order_not_found", "No matching order found for this customer.");
  }
  if (owned.length === 0) {
    return fail("order_not_found", "No orders found for this customer.", { orders: [] });
  }

  return ok("orders_listed", {
    orders: owned.map(mapOrder),
  });
}

export async function getCustomerOrderStatus(
  ports: SalesOrderToolPorts,
  input: {
    companyId: string;
    conversationId: string;
    orderId?: string | null;
    orderNumber?: string | null;
    customerPhone?: string | null;
  },
): Promise<OrderStatusToolResult> {
  const listed = await listCustomerOrders(ports, {
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
    return ok("multiple_orders", {
      orders: listed.orders,
      reason: "Multiple orders found; ask which orderNumber the customer means.",
    });
  }

  return ok("order_status", { order: target, orders: [target] });
}
