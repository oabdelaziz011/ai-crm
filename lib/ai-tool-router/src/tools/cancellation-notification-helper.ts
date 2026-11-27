/**
 * Idempotent in-app cancellation notifications using the real notifications schema.
 * message stores JSON payload (messageKey + params) matching login-app localization.
 */

export type CancellationNotificationKind =
  | "completed"
  | "request_pending"
  | "request_approved"
  | "request_rejected";

const TITLES: Record<CancellationNotificationKind, string> = {
  completed: "Customer Order Cancelled",
  request_pending: "Customer Cancellation Request – Pending Approval",
  request_approved: "Customer Cancellation Approved",
  request_rejected: "Customer Cancellation Rejected",
};

export function buildCancellationNotificationRow(input: {
  companyId: string;
  userId: string;
  kind: CancellationNotificationKind;
  detail: string;
  idempotencyKey: string;
  orderId: string;
  orderNumber: string;
  extraParams?: Record<string, string | null | undefined>;
}): {
  company_id: string;
  user_id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success";
  category: "system";
  event_type: string;
  channel: "in_app";
  delivery_status: "delivered";
  priority: "normal" | "high";
  idempotency_key: string;
} {
  const title = TITLES[input.kind];
  const type =
    input.kind === "request_pending"
      ? "warning"
      : input.kind === "request_rejected"
        ? "info"
        : input.kind === "request_approved" || input.kind === "completed"
          ? "success"
          : "info";
  const params: Record<string, string> = {
    title,
    detail: input.detail,
    body: input.detail,
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    navigationTarget: "/dashboard/sales-orders",
    entityType: "sales_order",
    entityId: input.orderId,
    kind: `order_cancellation_${input.kind}`,
  };
  for (const [k, v] of Object.entries(input.extraParams ?? {})) {
    if (v != null && String(v).trim()) params[k] = String(v);
  }
  return {
    company_id: input.companyId,
    user_id: input.userId,
    title,
    message: JSON.stringify({
      messageKey: "notifications.platform.templates.genericSystem.message",
      params,
    }),
    type,
    category: "system",
    event_type: "generic_system",
    channel: "in_app",
    delivery_status: "delivered",
    priority: input.kind === "request_pending" ? "high" : "normal",
    idempotency_key: input.idempotencyKey,
  };
}

export async function insertIdempotentCancellationNotification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { from: (table: string) => any },
  row: ReturnType<typeof buildCancellationNotificationRow>,
): Promise<{ inserted: boolean; duplicate: boolean; error?: string }> {
  const { data, error } = await client.from("notifications").insert(row).select("id").maybeSingle();
  if (!error) return { inserted: Boolean(data), duplicate: false };
  if (/unique|duplicate|idempotency/i.test(String(error?.message ?? "")) || error?.code === "23505") {
    return { inserted: false, duplicate: true };
  }
  return { inserted: false, duplicate: false, error: String(error?.message ?? "insert failed") };
}
