import type { SupabaseClient } from "@supabase/supabase-js";
import { EmployeeIdentityService } from "@/lib/employee-identity/employee-identity-service";
import {
  isSalesOrderPaymentMethod,
  isSalesOrderStatus,
  normalizeSalesOrdersPageSize,
  type CustomerSalesOrderHistory,
  type SalesOrderDeliveryAssignment,
  type SalesOrderDetail,
  type SalesOrderItem,
  type SalesOrderListRow,
  type SalesOrderPaymentMethod,
  type SalesOrderPaymentStatus,
  type SalesOrderStatus,
  type SalesOrderStatusEvent,
  type SalesOrdersListFilters,
  type SalesOrdersListPage,
} from "./sales-order-types";
import { pickLeastLoadedDeliveryWorker } from "./delivery-assignment-picker";
import { buildCancellationWorkerMessage as buildCancelWorkerMsg } from "./sales-order-cancellation-message";
import {
  buildCancellationNotificationRow,
  insertIdempotentCancellationNotification,
} from "@workspace/ai-tool-router";

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email?: string | null;
  preferred_language?: string | null;
  conversation_id: string | null;
  delivery_zone_id: string | null;
  delivery_governorate: string | null;
  delivery_city_area: string | null;
  delivery_address: string | null;
  delivery_notes: string | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  delivery_location_url?: string | null;
  customer_secondary_phone?: string | null;
  eta_min_snapshot?: number | null;
  eta_max_snapshot?: number | null;
  eta_unit_snapshot?: string | null;
  assigned_delivery_worker_id?: string | null;
  assigned_at?: string | null;
  assigned_by?: string | null;
  assignment_pending_reason?: string | null;
  delivery_assignment_mode_applied?: string | null;
  delivery_notify_status?: string | null;
  delivery_notify_message_id?: string | null;
  delivery_notify_error?: string | null;
  delivery_notify_idempotency_key?: string | null;
  delivery_fee: number | string | null;
  subtotal: number | string | null;
  total_amount: number | string | null;
  currency: string | null;
  source_channel?: string | null;
  payment_status?: string | null;
  ai_employee_id?: string | null;
  assigned_salesperson_id?: string | null;
  created_by_ai?: boolean | null;
  require_human_approval: boolean | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  cancelled_at: string | null;
  cancellation_source?: string | null;
  cancellation_reason?: string | null;
  cancelled_from_status?: string | null;
  cancellation_notify_status?: string | null;
  cancellation_notify_message_id?: string | null;
  cancellation_notify_error?: string | null;
  cancellation_notify_idempotency_key?: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
  sort_order: number | null;
};

type EventRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  changed_by: string | null;
  created_at: string;
};

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asStatus(value: string | null | undefined): SalesOrderStatus {
  return value && isSalesOrderStatus(value) ? value : "draft";
}

function asPayment(value: string | null | undefined): SalesOrderPaymentMethod {
  return value && isSalesOrderPaymentMethod(value) ? value : "cash_on_delivery";
}

function mapItem(row: ItemRow): SalesOrderItem {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSku: row.product_sku ?? "",
    quantity: toNumber(row.quantity, 1),
    unitPrice: toNumber(row.unit_price),
    lineTotal: toNumber(row.line_total),
    sortOrder: row.sort_order ?? 0,
  };
}

function mapEvent(row: EventRow, changedByName: string | null = null): SalesOrderStatusEvent {
  return {
    id: row.id,
    fromStatus: row.from_status && isSalesOrderStatus(row.from_status) ? row.from_status : null,
    toStatus: asStatus(row.to_status),
    note: row.note ?? "",
    changedBy: row.changed_by,
    changedByName,
    createdAt: row.created_at,
  };
}

function summarizeItems(items: SalesOrderItem[]): { summary: string; count: number } {
  if (items.length === 0) return { summary: "", count: 0 };
  const names = items.map((item) => item.productName).filter(Boolean);
  if (names.length <= 2) return { summary: names.join(", "), count: items.length };
  return {
    summary: `${names.slice(0, 2).join(", ")} +${names.length - 2}`,
    count: items.length,
  };
}

function mapListRow(row: OrderRow, items: SalesOrderItem[]): SalesOrderListRow {
  const summary = summarizeItems(items);
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: asStatus(row.status),
    paymentMethod: asPayment(row.payment_method),
    customerName: row.customer_name?.trim() || "",
    customerPhone: row.customer_phone?.trim() || "",
    itemsSummary: summary.summary,
    itemCount: summary.count,
    deliveryFee: toNumber(row.delivery_fee),
    totalAmount: toNumber(row.total_amount),
    currency: row.currency?.trim() || "EGP",
    createdAt: row.created_at,
  };
}

export function normalizeSalesOrdersFilters(
  input: Partial<SalesOrdersListFilters> | null | undefined,
): SalesOrdersListFilters {
  const status = input?.status;
  const paymentMethod = input?.paymentMethod;
  return {
    search: String(input?.search ?? "").trim(),
    status: status && status !== "all" && isSalesOrderStatus(status) ? status : "all",
    paymentMethod:
      paymentMethod && paymentMethod !== "all" && isSalesOrderPaymentMethod(paymentMethod)
        ? paymentMethod
        : "all",
    dateFrom: String(input?.dateFrom ?? "").trim(),
    dateTo: String(input?.dateTo ?? "").trim(),
    page: Math.max(1, Math.floor(Number(input?.page) || 1)),
    pageSize: normalizeSalesOrdersPageSize(input?.pageSize),
  };
}

export async function listSalesOrdersPage(
  client: SupabaseClient,
  companyId: string,
  filtersInput: Partial<SalesOrdersListFilters>,
): Promise<SalesOrdersListPage> {
  const filters = normalizeSalesOrdersFilters(filtersInput);
  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;

  let query = client
    .from("sales_orders")
    .select(
      "id, order_number, status, payment_method, customer_id, customer_name, customer_phone, conversation_id, delivery_zone_id, delivery_governorate, delivery_city_area, delivery_address, delivery_notes, delivery_fee, subtotal, total_amount, currency, require_human_approval, approved_at, approved_by, cancelled_at, created_at, updated_at",
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.paymentMethod !== "all") query = query.eq("payment_method", filters.paymentMethod);
  if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
  if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
  if (filters.search) {
    const term = filters.search.replace(/[%_]/g, "");
    query = query.or(
      `order_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) {
    if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
      throw new Error(
        "Sales orders table is missing. Apply migration 471 on the local database before using this page.",
      );
    }
    throw new Error(error.message);
  }

  const rows = (data ?? []) as OrderRow[];
  const orderIds = rows.map((row) => row.id);
  const itemsByOrder = new Map<string, SalesOrderItem[]>();

  if (orderIds.length > 0) {
    const { data: itemRows, error: itemsError } = await client
      .from("sales_order_items")
      .select("id, order_id, product_id, product_name, product_sku, quantity, unit_price, line_total, sort_order")
      .eq("company_id", companyId)
      .in("order_id", orderIds)
      .order("sort_order", { ascending: true });
    if (itemsError) throw new Error(itemsError.message);
    for (const item of (itemRows ?? []) as ItemRow[]) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push(mapItem(item));
      itemsByOrder.set(item.order_id, list);
    }
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize) || 1);
  const page = Math.min(filters.page, totalPages);

  return {
    items: rows.map((row) => mapListRow(row, itemsByOrder.get(row.id) ?? [])),
    total,
    page,
    pageSize: filters.pageSize,
    totalPages,
  };
}

export async function getSalesOrderDetail(
  client: SupabaseClient,
  companyId: string,
  orderId: string,
): Promise<SalesOrderDetail | null> {
  const { data, error } = await client
    .from("sales_orders")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as OrderRow;
  const [{ data: itemRows, error: itemsError }, { data: eventRows, error: eventsError }] =
    await Promise.all([
      client
        .from("sales_order_items")
        .select("id, order_id, product_id, product_name, product_sku, quantity, unit_price, line_total, sort_order")
        .eq("company_id", companyId)
        .eq("order_id", orderId)
        .order("sort_order", { ascending: true }),
      client
        .from("sales_order_status_events")
        .select("id, from_status, to_status, note, changed_by, created_at")
        .eq("company_id", companyId)
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
    ]);
  if (itemsError) throw new Error(itemsError.message);
  if (eventsError) throw new Error(eventsError.message);

  const items = ((itemRows ?? []) as ItemRow[]).map(mapItem);
  const list = mapListRow(row, items);

  const paymentStatusRaw = row.payment_status ?? "unpaid";
  const paymentStatus = (
    ["unpaid", "pending", "paid", "refunded", "failed"] as const
  ).includes(paymentStatusRaw as SalesOrderPaymentStatus)
    ? (paymentStatusRaw as SalesOrderPaymentStatus)
    : "unpaid";

  const rawEvents = (eventRows ?? []) as EventRow[];
  const actorIds = rawEvents
    .map((event) => event.changed_by)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  const identities = await EmployeeIdentityService.getManyByIds(actorIds);

  let assignedDeliveryWorkerName: string | null = null;
  let assignedDeliveryWorkerPhone: string | null = null;
  if (row.assigned_delivery_worker_id) {
    const { data: worker } = await client
      .from("company_delivery_workers")
      .select("full_name, phone_e164")
      .eq("id", row.assigned_delivery_worker_id)
      .eq("company_id", companyId)
      .maybeSingle();
    assignedDeliveryWorkerName = worker?.full_name ? String(worker.full_name) : null;
    assignedDeliveryWorkerPhone = worker?.phone_e164 ? String(worker.phone_e164) : null;
  }

  const { data: assignmentRows } = await client
    .from("sales_order_delivery_assignments")
    .select(
      "id, previous_worker_id, new_worker_id, assignment_mode, assigned_by, reassignment_reason, outcome, created_at",
    )
    .eq("company_id", companyId)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(20);

  const assignmentActorIds = [
    ...((assignmentRows ?? []).map((a) => a.assigned_by).filter(Boolean) as string[]),
  ];
  const workerIdsForNames = [
    ...new Set(
      (assignmentRows ?? []).flatMap((a) =>
        [a.previous_worker_id, a.new_worker_id].filter(Boolean).map(String),
      ),
    ),
  ];
  const assignmentIdentities = await EmployeeIdentityService.getManyByIds(assignmentActorIds);
  const workerNameById = new Map<string, string>();
  if (workerIdsForNames.length > 0) {
    const { data: workers } = await client
      .from("company_delivery_workers")
      .select("id, full_name")
      .eq("company_id", companyId)
      .in("id", workerIdsForNames);
    for (const w of workers ?? []) {
      workerNameById.set(String(w.id), String(w.full_name ?? ""));
    }
  }

  const deliveryAssignments: SalesOrderDeliveryAssignment[] = (assignmentRows ?? []).map((a) => ({
    id: String(a.id),
    previousWorkerId: a.previous_worker_id ? String(a.previous_worker_id) : null,
    previousWorkerName: a.previous_worker_id
      ? workerNameById.get(String(a.previous_worker_id)) ?? null
      : null,
    newWorkerId: a.new_worker_id ? String(a.new_worker_id) : null,
    newWorkerName: a.new_worker_id ? workerNameById.get(String(a.new_worker_id)) ?? null : null,
    assignmentMode: a.assignment_mode === "ai" ? "ai" : "manual",
    assignedBy: a.assigned_by ? String(a.assigned_by) : null,
    assignedByName: a.assigned_by
      ? assignmentIdentities.get(String(a.assigned_by))?.fullName ?? null
      : null,
    reassignmentReason: a.reassignment_reason ? String(a.reassignment_reason) : null,
    outcome:
      a.outcome === "reassigned" || a.outcome === "failed"
        ? a.outcome
        : "assigned",
    createdAt: String(a.created_at),
  }));

  const etaUnitRaw = row.eta_unit_snapshot;
  const etaUnitSnapshot =
    etaUnitRaw === "hours" || etaUnitRaw === "days" ? etaUnitRaw : null;

  const notifyStatusRaw = row.delivery_notify_status ?? "none";
  const deliveryNotifyStatus =
    notifyStatusRaw === "pending" ||
    notifyStatusRaw === "sent" ||
    notifyStatusRaw === "failed"
      ? notifyStatusRaw
      : "none";

  const modeApplied = row.delivery_assignment_mode_applied;
  const deliveryAssignmentModeApplied =
    modeApplied === "manual" || modeApplied === "ai" ? modeApplied : null;

  const pendingCancellationRequest = await loadPendingCancellationRequest(
    client,
    companyId,
    orderId,
  );

  return {
    ...list,
    customerId: row.customer_id,
    conversationId: row.conversation_id,
    deliveryZoneId: row.delivery_zone_id,
    deliveryGovernorate: row.delivery_governorate ?? "",
    deliveryCityArea: row.delivery_city_area ?? "",
    deliveryAddress: row.delivery_address ?? "",
    deliveryNotes: row.delivery_notes ?? "",
    deliveryLat: row.delivery_lat ?? null,
    deliveryLng: row.delivery_lng ?? null,
    deliveryLocationUrl: row.delivery_location_url ?? "",
    customerSecondaryPhone: row.customer_secondary_phone ?? "",
    etaMinSnapshot: row.eta_min_snapshot ?? null,
    etaMaxSnapshot: row.eta_max_snapshot ?? null,
    etaUnitSnapshot,
    assignedDeliveryWorkerId: row.assigned_delivery_worker_id ?? null,
    assignedAt: row.assigned_at ?? null,
    assignedBy: row.assigned_by ?? null,
    assignedDeliveryWorkerName,
    assignedDeliveryWorkerPhone,
    assignmentPendingReason: row.assignment_pending_reason
      ? String(row.assignment_pending_reason)
      : null,
    deliveryAssignmentModeApplied,
    deliveryNotifyStatus,
    deliveryNotifyMessageId: row.delivery_notify_message_id
      ? String(row.delivery_notify_message_id)
      : null,
    deliveryNotifyError: row.delivery_notify_error ? String(row.delivery_notify_error) : null,
    deliveryNotifyIdempotencyKey: row.delivery_notify_idempotency_key
      ? String(row.delivery_notify_idempotency_key)
      : null,
    deliveryAssignments,
    customerEmail: row.customer_email ?? "",
    preferredLanguage: row.preferred_language ?? "",
    sourceChannel: row.source_channel ?? "",
    paymentStatus,
    aiEmployeeId: row.ai_employee_id ?? null,
    assignedSalespersonId: row.assigned_salesperson_id ?? null,
    createdByAi: row.created_by_ai === true,
    subtotal: toNumber(row.subtotal),
    requireHumanApproval: row.require_human_approval !== false,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    rejectedAt: row.rejected_at ?? null,
    rejectedBy: row.rejected_by ?? null,
    cancelledAt: row.cancelled_at,
    cancellationSource:
      row.cancellation_source === "customer" ||
      row.cancellation_source === "employee" ||
      row.cancellation_source === "system"
        ? row.cancellation_source
        : null,
    cancellationReason: row.cancellation_reason ? String(row.cancellation_reason) : null,
    cancelledFromStatus: isSalesOrderStatus(String(row.cancelled_from_status ?? ""))
      ? (row.cancelled_from_status as SalesOrderDetail["cancelledFromStatus"])
      : null,
    cancellationNotifyStatus:
      row.cancellation_notify_status === "pending" ||
      row.cancellation_notify_status === "sent" ||
      row.cancellation_notify_status === "failed" ||
      row.cancellation_notify_status === "skipped"
        ? row.cancellation_notify_status
        : "none",
    cancellationNotifyMessageId: row.cancellation_notify_message_id
      ? String(row.cancellation_notify_message_id)
      : null,
    cancellationNotifyError: row.cancellation_notify_error
      ? String(row.cancellation_notify_error)
      : null,
    pendingCancellationRequest,
    updatedAt: row.updated_at,
    items,
    statusHistory: rawEvents.map((event) =>
      mapEvent(
        event,
        event.changed_by ? identities.get(event.changed_by)?.fullName ?? null : null,
      ),
    ),
  };
}

async function loadPendingCancellationRequest(
  client: SupabaseClient,
  companyId: string,
  orderId: string,
): Promise<SalesOrderDetail["pendingCancellationRequest"]> {
  const { data } = await client
    .from("sales_order_cancellation_requests")
    .select(
      "id, status, reason, order_status_at_request, requested_at, decided_at, decided_by, decision_reason, customer_notify_status, customer_notify_error",
    )
    .eq("company_id", companyId)
    .eq("order_id", orderId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const status =
    data.status === "approved" || data.status === "rejected" || data.status === "pending"
      ? data.status
      : "pending";
  let decidedByName: string | null = null;
  if (data.decided_by) {
    const identities = await EmployeeIdentityService.getManyByIds([String(data.decided_by)]);
    decidedByName = identities.get(String(data.decided_by))?.fullName ?? null;
  }
  const customerNotifyStatusRaw = String(data.customer_notify_status ?? "none");
  const customerNotifyStatuses = [
    "none",
    "pending",
    "sent",
    "failed",
    "skipped",
    "dry_run",
  ] as const;
  const customerNotifyStatus = customerNotifyStatuses.includes(
    customerNotifyStatusRaw as (typeof customerNotifyStatuses)[number],
  )
    ? (customerNotifyStatusRaw as (typeof customerNotifyStatuses)[number])
    : "none";
  return {
    id: String(data.id),
    status,
    reason: data.reason ? String(data.reason) : null,
    orderStatusAtRequest: String(data.order_status_at_request ?? ""),
    requestedAt: String(data.requested_at),
    decidedAt: data.decided_at ? String(data.decided_at) : null,
    decidedBy: data.decided_by ? String(data.decided_by) : null,
    decidedByName,
    decisionReason: data.decision_reason ? String(data.decision_reason) : null,
    customerNotifyStatus,
    customerNotifyError: data.customer_notify_error ? String(data.customer_notify_error) : null,
  };
}

export async function listCustomerSalesOrderHistory(
  client: SupabaseClient,
  companyId: string,
  customerId: string,
): Promise<CustomerSalesOrderHistory> {
  const { data, error } = await client
    .from("sales_orders")
    .select(
      "id, order_number, status, payment_method, customer_id, customer_name, customer_phone, conversation_id, delivery_fee, subtotal, total_amount, currency, created_at, updated_at",
    )
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as OrderRow[];
  const orderIds = rows.map((row) => row.id);
  const itemsByOrder = new Map<string, SalesOrderItem[]>();
  if (orderIds.length > 0) {
    const { data: itemRows, error: itemsError } = await client
      .from("sales_order_items")
      .select("id, order_id, product_id, product_name, product_sku, quantity, unit_price, line_total, sort_order")
      .eq("company_id", companyId)
      .in("order_id", orderIds)
      .order("sort_order", { ascending: true });
    if (itemsError) throw new Error(itemsError.message);
    for (const item of (itemRows ?? []) as ItemRow[]) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push(mapItem(item));
      itemsByOrder.set(item.order_id, list);
    }
  }

  const orders = rows.map((row) => mapListRow(row, itemsByOrder.get(row.id) ?? []));
  const totalValue = Number(
    orders.reduce((sum, order) => sum + order.totalAmount, 0).toFixed(2),
  );
  const dates = orders.map((order) => order.createdAt).filter(Boolean);
  return {
    totalOrders: orders.length,
    totalValue,
    currency: orders[0]?.currency ?? "EGP",
    firstOrderAt: dates.length ? dates[dates.length - 1]! : null,
    lastOrderAt: dates[0] ?? null,
    orders,
  };
}

export type AutoAssignDeliveryResult = {
  autoAssigned: boolean;
  assignResult?: {
    notifyMessage: string;
    workerPhone: string;
    workerName: string;
    idempotencyKey: string;
  };
  pendingReason?: string;
  error?: string;
};

export type AssignDeliveryResult = {
  notifyMessage: string;
  workerPhone: string;
  workerName: string;
  idempotencyKey: string;
  outcome: "assigned" | "reassigned";
};

async function assertCanAssignDelivery(client: SupabaseClient): Promise<void> {
  const { data: isSuper, error: superError } = await client.rpc("is_super_admin");
  if (superError) throw new Error(superError.message);
  if (isSuper === true) return;
  const { data: allowed, error } = await client.rpc("user_has_permission", {
    p_code: "orders.assign_delivery",
  });
  if (error) throw new Error(error.message);
  if (allowed !== true) {
    throw new Error("Missing permission: orders.assign_delivery");
  }
}

export async function approveSalesOrder(
  client: SupabaseClient,
  input: { companyId: string; orderId: string; userId: string; note?: string },
): Promise<AutoAssignDeliveryResult> {
  const detail = await getSalesOrderDetail(client, input.companyId, input.orderId);
  if (!detail) throw new Error("Order not found.");
  if (detail.status !== "pending_approval") {
    throw new Error("Only pending_approval orders can be approved.");
  }
  const now = new Date().toISOString();
  const { error } = await client
    .from("sales_orders")
    .update({
      status: "confirmed",
      approved_at: now,
      approved_by: input.userId,
      updated_by: input.userId,
      updated_at: now,
    })
    .eq("company_id", input.companyId)
    .eq("id", input.orderId)
    .eq("status", "pending_approval");
  if (error) throw new Error(error.message);

  const { error: eventError } = await client.from("sales_order_status_events").insert({
    company_id: input.companyId,
    order_id: input.orderId,
    from_status: "pending_approval",
    to_status: "confirmed",
    note: input.note?.trim() || "Approved by human reviewer",
    changed_by: input.userId,
  });
  if (eventError) throw new Error(eventError.message);

  return tryAutoAssignDeliveryAfterConfirm(client, {
    companyId: input.companyId,
    orderId: input.orderId,
    userId: input.userId,
    deliveryZoneId: detail.deliveryZoneId,
  });
}

export async function rejectSalesOrder(
  client: SupabaseClient,
  input: { companyId: string; orderId: string; userId: string; note?: string },
): Promise<void> {
  const detail = await getSalesOrderDetail(client, input.companyId, input.orderId);
  if (!detail) throw new Error("Order not found.");
  if (detail.status !== "pending_approval") {
    throw new Error("Only pending_approval orders can be rejected.");
  }
  const now = new Date().toISOString();
  const { error } = await client
    .from("sales_orders")
    .update({
      status: "cancelled",
      cancelled_at: now,
      rejected_at: now,
      rejected_by: input.userId,
      updated_by: input.userId,
      updated_at: now,
    })
    .eq("company_id", input.companyId)
    .eq("id", input.orderId)
    .eq("status", "pending_approval");
  if (error) throw new Error(error.message);

  const { error: eventError } = await client.from("sales_order_status_events").insert({
    company_id: input.companyId,
    order_id: input.orderId,
    from_status: "pending_approval",
    to_status: "cancelled",
    note: input.note?.trim() || "Rejected by human reviewer",
    changed_by: input.userId,
  });
  if (eventError) throw new Error(eventError.message);
}

const LIFECYCLE_TRANSITIONS: Record<string, SalesOrderStatus[]> = {
  confirmed: ["processing"],
  // out_for_delivery is set only via assignSalesOrderDelivery (worker dispatch).
  processing: ["delivered"],
  out_for_delivery: ["delivered"],
};

/**
 * Advance order through processing / delivered (employee-driven lifecycle).
 * Assignment remains the path that sets out_for_delivery with a worker.
 */
export async function updateSalesOrderLifecycleStatus(
  client: SupabaseClient,
  input: {
    companyId: string;
    orderId: string;
    userId: string;
    toStatus: "processing" | "delivered";
    note?: string;
  },
): Promise<SalesOrderDetail> {
  const detail = await getSalesOrderDetail(client, input.companyId, input.orderId);
  if (!detail) throw new Error("Order not found.");
  if (detail.status === "cancelled") {
    throw new Error("Cancelled orders cannot change lifecycle status.");
  }
  const allowed = LIFECYCLE_TRANSITIONS[detail.status] ?? [];
  if (!allowed.includes(input.toStatus)) {
    throw new Error(`Cannot move order from ${detail.status} to ${input.toStatus}.`);
  }
  const now = new Date().toISOString();
  const { data: updated, error } = await client
    .from("sales_orders")
    .update({
      status: input.toStatus,
      updated_by: input.userId,
      updated_at: now,
    })
    .eq("company_id", input.companyId)
    .eq("id", input.orderId)
    .eq("status", detail.status)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) throw new Error("Order status changed; refresh and try again.");

  const { error: eventError } = await client.from("sales_order_status_events").insert({
    company_id: input.companyId,
    order_id: input.orderId,
    from_status: detail.status,
    to_status: input.toStatus,
    note: input.note?.trim() || `Status set to ${input.toStatus}`,
    changed_by: input.userId,
  });
  if (eventError) throw new Error(eventError.message);

  const next = await getSalesOrderDetail(client, input.companyId, input.orderId);
  if (!next) throw new Error("Order not found after status update.");
  return next;
}

export function buildDeliveryWorkerDispatchMessage(detail: SalesOrderDetail, workerName: string): string {
  const lines = [
    `طلب توصيل جديد: ${detail.orderNumber}`,
    `العامل: ${workerName}`,
    `العميل: ${detail.customerName || "—"}`,
    `هاتف العميل: ${detail.customerPhone || "—"}`,
  ];
  if (detail.customerSecondaryPhone) {
    lines.push(`رقم بديل: ${detail.customerSecondaryPhone}`);
  }
  lines.push(
    `العنوان: ${[detail.deliveryGovernorate, detail.deliveryCityArea].filter(Boolean).join(" · ") || "—"}`,
    detail.deliveryAddress || "—",
  );
  if (detail.deliveryLocationUrl) lines.push(`الموقع: ${detail.deliveryLocationUrl}`);
  if (detail.deliveryLat != null && detail.deliveryLng != null) {
    lines.push(`إحداثيات: ${detail.deliveryLat}, ${detail.deliveryLng}`);
  }
  if (detail.itemsSummary) lines.push(`المنتجات: ${detail.itemsSummary}`);
  lines.push(`الإجمالي COD: ${detail.totalAmount} ${detail.currency}`);
  if (detail.etaMinSnapshot != null && detail.etaMaxSnapshot != null && detail.etaUnitSnapshot) {
    lines.push(`ETA: ${detail.etaMinSnapshot}–${detail.etaMaxSnapshot} ${detail.etaUnitSnapshot}`);
  }
  if (detail.deliveryNotes) lines.push(`ملاحظات: ${detail.deliveryNotes}`);
  return lines.join("\n");
}

async function markAssignmentPending(
  client: SupabaseClient,
  input: {
    companyId: string;
    orderId: string;
    userId: string;
    reason: string;
    mode: "manual" | "ai";
  },
): Promise<void> {
  const now = new Date().toISOString();
  await client
    .from("sales_orders")
    .update({
      assignment_pending_reason: input.reason,
      updated_by: input.userId,
      updated_at: now,
    })
    .eq("company_id", input.companyId)
    .eq("id", input.orderId)
    .is("assigned_delivery_worker_id", null);

  await client.from("sales_order_delivery_assignments").insert({
    company_id: input.companyId,
    order_id: input.orderId,
    previous_worker_id: null,
    new_worker_id: null,
    assignment_mode: input.mode,
    assigned_by: input.userId,
    reassignment_reason: null,
    outcome: "failed",
  });

  await client.from("sales_order_status_events").insert({
    company_id: input.companyId,
    order_id: input.orderId,
    from_status: "confirmed",
    to_status: "confirmed",
    note: `Assignment pending: ${input.reason}`,
    changed_by: input.userId,
  });
}

export async function assignSalesOrderDelivery(
  client: SupabaseClient,
  input: {
    companyId: string;
    orderId: string;
    userId: string;
    workerId: string;
    mode?: "manual" | "ai";
    reassign?: boolean;
    reassignmentReason?: string;
    skipPermissionCheck?: boolean;
  },
): Promise<AssignDeliveryResult> {
  if (!input.skipPermissionCheck) {
    await assertCanAssignDelivery(client);
  }

  const mode = input.mode === "ai" ? "ai" : "manual";
  const reassign = input.reassign === true;
  const detail = await getSalesOrderDetail(client, input.companyId, input.orderId);
  if (!detail) throw new Error("Order not found.");
  if (detail.status === "cancelled") {
    throw new Error("Cancelled orders cannot be assigned or dispatched.");
  }

  if (reassign) {
    if (!detail.assignedDeliveryWorkerId) {
      throw new Error("Order is not assigned; use assign instead of reassign.");
    }
    if (!input.reassignmentReason?.trim()) {
      throw new Error("Reassignment reason is required.");
    }
    if (
      detail.status !== "out_for_delivery" &&
      detail.status !== "processing" &&
      detail.status !== "confirmed"
    ) {
      throw new Error("Order cannot be reassigned in its current status.");
    }
  } else {
    if (detail.assignedDeliveryWorkerId) {
      throw new Error("Order is already assigned. Use reassign to change the worker.");
    }
    if (detail.status !== "confirmed" && detail.status !== "processing") {
      throw new Error("Only confirmed orders can be assigned to a delivery worker.");
    }
  }

  if (!detail.deliveryZoneId) {
    throw new Error("Order has no delivery zone; cannot assign a worker.");
  }

  const { data: worker, error: workerError } = await client
    .from("company_delivery_workers")
    .select("id, full_name, phone_e164, is_active")
    .eq("id", input.workerId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (workerError) throw new Error(workerError.message);
  if (!worker || worker.is_active === false) {
    throw new Error("Delivery worker not found or inactive.");
  }

  const { data: link } = await client
    .from("company_delivery_worker_zones")
    .select("worker_id")
    .eq("worker_id", input.workerId)
    .eq("delivery_zone_id", detail.deliveryZoneId)
    .maybeSingle();
  if (!link) {
    throw new Error("Worker is not mapped to this order delivery zone.");
  }

  const now = new Date().toISOString();
  const fromStatus = detail.status;
  const previousWorkerId = detail.assignedDeliveryWorkerId;
  const idempotencyKey = `delivery-dispatch:${input.orderId}:${input.workerId}:${now}`;

  let updateQuery = client
    .from("sales_orders")
    .update({
      status: "out_for_delivery",
      assigned_delivery_worker_id: input.workerId,
      assigned_at: now,
      assigned_by: input.userId,
      updated_by: input.userId,
      updated_at: now,
      assignment_pending_reason: null,
      delivery_assignment_mode_applied: mode,
      delivery_notify_status: "pending",
      delivery_notify_error: null,
      delivery_notify_message_id: null,
      delivery_notify_idempotency_key: idempotencyKey,
      delivery_notify_attempted_at: null,
    })
    .eq("company_id", input.companyId)
    .eq("id", input.orderId);

  if (reassign) {
    updateQuery = updateQuery.eq("assigned_delivery_worker_id", previousWorkerId!);
  } else {
    updateQuery = updateQuery
      .is("assigned_delivery_worker_id", null)
      .in("status", ["confirmed", "processing"]);
  }

  const { data: updatedRows, error } = await updateQuery.select("id");
  if (error) throw new Error(error.message);
  if (!updatedRows?.length) {
    throw new Error(
      reassign
        ? "Reassignment failed; order may have changed. Refresh and try again."
        : "Assignment failed; order may already be assigned. Refresh and try again.",
    );
  }

  const workerName = String(worker.full_name);
  const workerPhone = String(worker.phone_e164);
  const outcome = reassign ? ("reassigned" as const) : ("assigned" as const);
  const notifyMessage = buildDeliveryWorkerDispatchMessage(
    { ...detail, assignedDeliveryWorkerName: workerName, assignedDeliveryWorkerPhone: workerPhone },
    workerName,
  );

  const { error: auditError } = await client.from("sales_order_delivery_assignments").insert({
    company_id: input.companyId,
    order_id: input.orderId,
    previous_worker_id: previousWorkerId,
    new_worker_id: input.workerId,
    assignment_mode: mode,
    assigned_by: input.userId,
    reassignment_reason: reassign ? input.reassignmentReason!.trim() : null,
    outcome,
  });
  if (auditError) throw new Error(auditError.message);

  const note = reassign
    ? `Reassigned delivery worker to ${workerName} (mode=${mode}). Reason: ${input.reassignmentReason!.trim()}`
    : `Assigned to delivery worker ${workerName} (mode=${mode})`;

  const { error: eventError } = await client.from("sales_order_status_events").insert({
    company_id: input.companyId,
    order_id: input.orderId,
    from_status: fromStatus,
    to_status: "out_for_delivery",
    note,
    changed_by: input.userId,
  });
  if (eventError) throw new Error(eventError.message);

  return { notifyMessage, workerPhone, workerName, idempotencyKey, outcome };
}

export async function recordDeliveryNotifyResult(
  client: SupabaseClient,
  input: {
    companyId: string;
    orderId: string;
    idempotencyKey: string;
    ok: boolean;
    messageId?: string | null;
    error?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  if (input.ok) {
    const { error } = await client
      .from("sales_orders")
      .update({
        delivery_notify_status: "sent",
        delivery_notify_message_id: input.messageId?.trim() || null,
        delivery_notify_error: null,
        delivery_notify_attempted_at: now,
      })
      .eq("company_id", input.companyId)
      .eq("id", input.orderId)
      .eq("delivery_notify_idempotency_key", input.idempotencyKey);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await client
    .from("sales_orders")
    .update({
      delivery_notify_status: "failed",
      delivery_notify_error: input.error?.trim() || "WhatsApp notify failed",
      delivery_notify_attempted_at: now,
    })
    .eq("company_id", input.companyId)
    .eq("id", input.orderId)
    .eq("delivery_notify_idempotency_key", input.idempotencyKey);
  if (error) throw new Error(error.message);
}

/**
 * Retry WhatsApp notify for an assigned order. Skips if the same idempotency key
 * already has status=sent (no duplicate messages).
 */
export async function prepareDeliveryNotifyRetry(
  client: SupabaseClient,
  input: { companyId: string; orderId: string; userId: string },
): Promise<{
  skipped: boolean;
  reason?: string;
  notifyMessage?: string;
  workerPhone?: string;
  workerName?: string;
  idempotencyKey?: string;
}> {
  await assertCanAssignDelivery(client);
  const detail = await getSalesOrderDetail(client, input.companyId, input.orderId);
  if (!detail) throw new Error("Order not found.");
  if (!detail.assignedDeliveryWorkerId || !detail.assignedDeliveryWorkerPhone) {
    throw new Error("Order has no assigned delivery worker.");
  }
  if (
    detail.deliveryNotifyStatus === "sent" &&
    detail.deliveryNotifyIdempotencyKey &&
    detail.deliveryNotifyMessageId
  ) {
    return { skipped: true, reason: "Notification already sent for this assignment." };
  }

  const now = new Date().toISOString();
  const idempotencyKey =
    detail.deliveryNotifyIdempotencyKey ||
    `delivery-dispatch:${input.orderId}:${detail.assignedDeliveryWorkerId}:${now}`;
  const workerName = detail.assignedDeliveryWorkerName || "worker";
  const notifyMessage = buildDeliveryWorkerDispatchMessage(detail, workerName);

  const { error } = await client
    .from("sales_orders")
    .update({
      delivery_notify_status: "pending",
      delivery_notify_idempotency_key: idempotencyKey,
      delivery_notify_error: null,
      updated_by: input.userId,
      updated_at: now,
    })
    .eq("company_id", input.companyId)
    .eq("id", input.orderId);
  if (error) throw new Error(error.message);

  return {
    skipped: false,
    notifyMessage,
    workerPhone: detail.assignedDeliveryWorkerPhone,
    workerName,
    idempotencyKey,
  };
}

async function pickLoadBalancedWorkerForZone(
  client: SupabaseClient,
  input: { companyId: string; deliveryZoneId: string },
): Promise<string | null> {
  const { data: links, error: linkError } = await client
    .from("company_delivery_worker_zones")
    .select("worker_id, company_delivery_workers!inner(id, is_active)")
    .eq("delivery_zone_id", input.deliveryZoneId);
  if (linkError) throw new Error(linkError.message);

  const eligibleIds = [
    ...new Set(
      (links ?? [])
        .map((row) => {
          const worker = row.company_delivery_workers as
            | { id?: string; is_active?: boolean }
            | { id?: string; is_active?: boolean }[]
            | null;
          const normalized = Array.isArray(worker) ? worker[0] : worker;
          if (!normalized?.id || normalized.is_active === false) return null;
          return String(normalized.id);
        })
        .filter(Boolean) as string[],
    ),
  ];
  if (eligibleIds.length === 0) return null;

  const { data: openOrders, error: openError } = await client
    .from("sales_orders")
    .select("assigned_delivery_worker_id, assigned_at")
    .eq("company_id", input.companyId)
    .in("status", ["out_for_delivery", "processing"])
    .in("assigned_delivery_worker_id", eligibleIds);
  if (openError) throw new Error(openError.message);

  const countByWorker = new Map<string, number>();
  const lastAssignedByWorker = new Map<string, string | null>();
  for (const id of eligibleIds) {
    countByWorker.set(id, 0);
    lastAssignedByWorker.set(id, null);
  }
  for (const row of openOrders ?? []) {
    const wid = row.assigned_delivery_worker_id ? String(row.assigned_delivery_worker_id) : null;
    if (!wid || !countByWorker.has(wid)) continue;
    countByWorker.set(wid, (countByWorker.get(wid) ?? 0) + 1);
    const prev = lastAssignedByWorker.get(wid);
    const at = row.assigned_at ? String(row.assigned_at) : null;
    if (at && (!prev || Date.parse(at) > Date.parse(prev))) {
      lastAssignedByWorker.set(wid, at);
    }
  }

  return pickLeastLoadedDeliveryWorker(
    eligibleIds.map((workerId) => ({
      workerId,
      openAssignedCount: countByWorker.get(workerId) ?? 0,
      lastAssignedAt: lastAssignedByWorker.get(workerId) ?? null,
    })),
  );
}

/**
 * When company delivery_assignment_mode = ai, assign the least-loaded eligible worker.
 * Failures are returned (not thrown) so approval still succeeds; pending reason is stored.
 */
export async function tryAutoAssignDeliveryAfterConfirm(
  client: SupabaseClient,
  input: {
    companyId: string;
    orderId: string;
    userId: string;
    deliveryZoneId: string | null;
  },
): Promise<AutoAssignDeliveryResult> {
  const { data: settings } = await client
    .from("company_order_settings")
    .select("delivery_assignment_mode")
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (settings?.delivery_assignment_mode !== "ai") {
    return { autoAssigned: false };
  }
  if (!input.deliveryZoneId) {
    const reason = "Order has no delivery zone for AI assignment.";
    await markAssignmentPending(client, {
      companyId: input.companyId,
      orderId: input.orderId,
      userId: input.userId,
      reason,
      mode: "ai",
    });
    return { autoAssigned: false, pendingReason: reason, error: reason };
  }

  try {
    const workerId = await pickLoadBalancedWorkerForZone(client, {
      companyId: input.companyId,
      deliveryZoneId: input.deliveryZoneId,
    });
    if (!workerId) {
      const reason = "No active delivery worker for this zone.";
      await markAssignmentPending(client, {
        companyId: input.companyId,
        orderId: input.orderId,
        userId: input.userId,
        reason,
        mode: "ai",
      });
      return { autoAssigned: false, pendingReason: reason, error: reason };
    }

    const assignResult = await assignSalesOrderDelivery(client, {
      companyId: input.companyId,
      orderId: input.orderId,
      userId: input.userId,
      workerId,
      mode: "ai",
      // Approver already authorized the confirmation path; avoid double-blocking auto path.
      skipPermissionCheck: true,
    });
    return { autoAssigned: true, assignResult };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markAssignmentPending(client, {
      companyId: input.companyId,
      orderId: input.orderId,
      userId: input.userId,
      reason,
      mode: "ai",
    });
    return { autoAssigned: false, pendingReason: reason, error: reason };
  }
}

async function assertCanApproveCancellation(client: SupabaseClient): Promise<void> {
  const { data: isSuper, error: superError } = await client.rpc("is_super_admin");
  if (superError) throw new Error(superError.message);
  if (isSuper === true) return;
  const { data: allowed, error } = await client.rpc("user_has_permission", {
    p_code: "orders.approve_cancellation",
  });
  if (error) throw new Error(error.message);
  if (allowed !== true) {
    throw new Error("Missing permission: orders.approve_cancellation");
  }
}

export function buildCancellationWorkerMessage(detail: SalesOrderDetail): string {
  return buildCancelWorkerMsg({
    orderNumber: detail.orderNumber,
    customerName: detail.customerName,
    cancellationReason: detail.cancellationReason,
  });
}

export async function recordCancellationNotifyResult(
  client: SupabaseClient,
  input: {
    companyId: string;
    orderId: string;
    idempotencyKey: string;
    ok: boolean;
    messageId?: string | null;
    error?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  if (input.ok) {
    const { error } = await client
      .from("sales_orders")
      .update({
        cancellation_notify_status: "sent",
        cancellation_notify_message_id: input.messageId?.trim() || null,
        cancellation_notify_error: null,
        cancellation_notify_attempted_at: now,
      })
      .eq("company_id", input.companyId)
      .eq("id", input.orderId)
      .eq("cancellation_notify_idempotency_key", input.idempotencyKey);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await client
    .from("sales_orders")
    .update({
      cancellation_notify_status: "failed",
      cancellation_notify_error: input.error?.trim() || "WhatsApp notify failed",
      cancellation_notify_attempted_at: now,
    })
    .eq("company_id", input.companyId)
    .eq("id", input.orderId)
    .eq("cancellation_notify_idempotency_key", input.idempotencyKey);
  if (error) throw new Error(error.message);
}

export type DecideCancellationRequestResult = {
  cancelled: boolean;
  notifyMessage?: string;
  workerPhone?: string | null;
  idempotencyKey?: string | null;
  customerNotifyStatus?: string;
  customerMessage?: string | null;
};

async function notifyStaffCancellationDecision(
  client: SupabaseClient,
  input: {
    companyId: string;
    orderId: string;
    orderNumber: string;
    userId: string;
    kind: "request_approved" | "request_rejected";
    detail: string;
  },
): Promise<void> {
  try {
    const recipients = new Set<string>([input.userId]);
    const { data: profiles } = await client
      .from("profiles")
      .select("id")
      .eq("company_id", input.companyId)
      .limit(5);
    for (const p of profiles ?? []) recipients.add(String(p.id));
    for (const userId of [...recipients].slice(0, 5)) {
      await insertIdempotentCancellationNotification(
        client,
        buildCancellationNotificationRow({
          companyId: input.companyId,
          userId,
          kind: input.kind,
          detail: input.detail,
          idempotencyKey: `order-cancel-${input.kind}:${input.orderId}:${userId}`,
          orderId: input.orderId,
          orderNumber: input.orderNumber,
        }),
      );
    }
  } catch {
    /* non-blocking */
  }
}

/**
 * Customer proactive notify: safe path is next AI turn (tool surfaces decision).
 * Records skipped/dry_run on the request; never rolls back the employee decision.
 * Does not send real WhatsApp without explicit outbound opt-in (handled by callers).
 */
async function recordCustomerDecisionNotifySkipped(
  client: SupabaseClient,
  input: {
    companyId: string;
    requestId: string;
    orderId: string;
    decision: "approved" | "rejected";
  },
): Promise<{ status: "skipped" | "dry_run"; message: string }> {
  const idem = `order-cancel-customer-${input.decision}:${input.requestId}`;
  const message =
    input.decision === "approved"
      ? `Your cancellation for order ${input.orderId} was approved. The order is now cancelled. This does not automatically process a refund.`
      : `Your cancellation request for order ${input.orderId} was not approved. The order remains active.`;
  const now = new Date().toISOString();
  await client
    .from("sales_order_cancellation_requests")
    .update({
      customer_notify_status: "skipped",
      customer_notify_idempotency_key: idem,
      customer_notify_error:
        "Proactive customer WhatsApp not sent: awaiting verified channel consent / next AI turn.",
      customer_notify_attempted_at: now,
      updated_at: now,
    })
    .eq("id", input.requestId)
    .eq("company_id", input.companyId);
  return { status: "skipped", message };
}

export async function approveCancellationRequest(
  client: SupabaseClient,
  input: {
    companyId: string;
    orderId: string;
    requestId: string;
    userId: string;
    decisionReason?: string;
  },
): Promise<DecideCancellationRequestResult> {
  await assertCanApproveCancellation(client);
  const detail = await getSalesOrderDetail(client, input.companyId, input.orderId);
  if (!detail) throw new Error("Order not found.");
  const pending = detail.pendingCancellationRequest;
  if (!pending || pending.id !== input.requestId || pending.status !== "pending") {
    throw new Error("No pending cancellation request for this order.");
  }
  if (!["processing", "out_for_delivery", "confirmed", "pending_approval"].includes(detail.status)) {
    throw new Error(`Order status ${detail.status} cannot be cancelled from this request.`);
  }
  const fromStatus = detail.status;
  const now = new Date().toISOString();
  const notifyKey = detail.assignedDeliveryWorkerId
    ? `order-cancel:${input.orderId}:${detail.assignedDeliveryWorkerId}`
    : null;

  const { data: updated, error } = await client
    .from("sales_orders")
    .update({
      status: "cancelled",
      cancelled_at: now,
      cancellation_source: "customer",
      cancellation_reason: pending.reason,
      cancelled_from_status: fromStatus,
      updated_by: input.userId,
      updated_at: now,
      cancellation_notify_status: detail.assignedDeliveryWorkerId ? "pending" : "skipped",
      cancellation_notify_idempotency_key: notifyKey,
    })
    .eq("company_id", input.companyId)
    .eq("id", input.orderId)
    .eq("status", fromStatus)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) throw new Error("Order status changed; refresh and try again.");

  const { data: reqUpdated, error: reqError } = await client
    .from("sales_order_cancellation_requests")
    .update({
      status: "approved",
      decided_at: now,
      decided_by: input.userId,
      decision_reason: input.decisionReason?.trim() || null,
      updated_at: now,
    })
    .eq("id", input.requestId)
    .eq("company_id", input.companyId)
    .eq("status", "pending")
    .select("id");
  if (reqError) throw new Error(reqError.message);
  if (!reqUpdated?.length) {
    throw new Error("Cancellation request was already decided by another employee.");
  }

  await client.from("sales_order_status_events").insert({
    company_id: input.companyId,
    order_id: input.orderId,
    from_status: fromStatus,
    to_status: "cancelled",
    note: input.decisionReason?.trim()
      ? `Customer cancellation approved. ${input.decisionReason.trim()}`
      : "Customer cancellation approved by employee",
    changed_by: input.userId,
  });

  await notifyStaffCancellationDecision(client, {
    companyId: input.companyId,
    orderId: input.orderId,
    orderNumber: detail.orderNumber,
    userId: input.userId,
    kind: "request_approved",
    detail: `Order ${detail.orderNumber} cancellation approved. Previous status: ${fromStatus}.`,
  });

  const customerNotify = await recordCustomerDecisionNotifySkipped(client, {
    companyId: input.companyId,
    requestId: input.requestId,
    orderId: detail.orderNumber,
    decision: "approved",
  });

  const refreshed = await getSalesOrderDetail(client, input.companyId, input.orderId);
  return {
    cancelled: true,
    notifyMessage: refreshed ? buildCancellationWorkerMessage(refreshed) : undefined,
    workerPhone: refreshed?.assignedDeliveryWorkerPhone ?? null,
    idempotencyKey: notifyKey,
    customerNotifyStatus: customerNotify.status,
    customerMessage: customerNotify.message,
  };
}

export async function rejectCancellationRequest(
  client: SupabaseClient,
  input: {
    companyId: string;
    orderId: string;
    requestId: string;
    userId: string;
    decisionReason?: string;
  },
): Promise<{ customerNotifyStatus: string; customerMessage: string }> {
  await assertCanApproveCancellation(client);
  const detail = await getSalesOrderDetail(client, input.companyId, input.orderId);
  if (!detail?.pendingCancellationRequest) {
    throw new Error("No pending cancellation request for this order.");
  }
  if (detail.pendingCancellationRequest.id !== input.requestId) {
    throw new Error("Cancellation request mismatch.");
  }
  if (detail.pendingCancellationRequest.status !== "pending") {
    throw new Error("Cancellation request was already decided.");
  }
  const now = new Date().toISOString();
  const { data: reqUpdated, error } = await client
    .from("sales_order_cancellation_requests")
    .update({
      status: "rejected",
      decided_at: now,
      decided_by: input.userId,
      decision_reason: input.decisionReason?.trim() || null,
      updated_at: now,
    })
    .eq("id", input.requestId)
    .eq("company_id", input.companyId)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error(error.message);
  if (!reqUpdated?.length) {
    throw new Error("Cancellation request was already decided by another employee.");
  }

  await client.from("sales_order_status_events").insert({
    company_id: input.companyId,
    order_id: input.orderId,
    from_status: detail.status,
    to_status: detail.status,
    note: input.decisionReason?.trim()
      ? `Customer cancellation rejected. ${input.decisionReason.trim()}`
      : "Customer cancellation request rejected by employee",
    changed_by: input.userId,
  });

  await notifyStaffCancellationDecision(client, {
    companyId: input.companyId,
    orderId: input.orderId,
    orderNumber: detail.orderNumber,
    userId: input.userId,
    kind: "request_rejected",
    detail: `Order ${detail.orderNumber} cancellation rejected. Order remains ${detail.status}.${
      input.decisionReason?.trim() ? ` Reason: ${input.decisionReason.trim()}` : ""
    }`,
  });

  const customerNotify = await recordCustomerDecisionNotifySkipped(client, {
    companyId: input.companyId,
    requestId: input.requestId,
    orderId: detail.orderNumber,
    decision: "rejected",
  });
  return {
    customerNotifyStatus: customerNotify.status,
    customerMessage: customerNotify.message,
  };
}
