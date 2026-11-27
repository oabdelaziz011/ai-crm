import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSalesOrderPaymentMethod,
  isSalesOrderStatus,
  normalizeSalesOrdersPageSize,
  type SalesOrderDetail,
  type SalesOrderItem,
  type SalesOrderListRow,
  type SalesOrderPaymentMethod,
  type SalesOrderStatus,
  type SalesOrderStatusEvent,
  type SalesOrdersListFilters,
  type SalesOrdersListPage,
} from "./sales-order-types";

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  conversation_id: string | null;
  delivery_zone_id: string | null;
  delivery_governorate: string | null;
  delivery_city_area: string | null;
  delivery_address: string | null;
  delivery_notes: string | null;
  delivery_fee: number | string | null;
  subtotal: number | string | null;
  total_amount: number | string | null;
  currency: string | null;
  require_human_approval: boolean | null;
  approved_at: string | null;
  approved_by: string | null;
  cancelled_at: string | null;
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

function mapEvent(row: EventRow): SalesOrderStatusEvent {
  return {
    id: row.id,
    fromStatus: row.from_status && isSalesOrderStatus(row.from_status) ? row.from_status : null,
    toStatus: asStatus(row.to_status),
    note: row.note ?? "",
    changedBy: row.changed_by,
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

  return {
    ...list,
    customerId: row.customer_id,
    conversationId: row.conversation_id,
    deliveryZoneId: row.delivery_zone_id,
    deliveryGovernorate: row.delivery_governorate ?? "",
    deliveryCityArea: row.delivery_city_area ?? "",
    deliveryAddress: row.delivery_address ?? "",
    deliveryNotes: row.delivery_notes ?? "",
    subtotal: toNumber(row.subtotal),
    requireHumanApproval: row.require_human_approval !== false,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    cancelledAt: row.cancelled_at,
    updatedAt: row.updated_at,
    items,
    statusHistory: ((eventRows ?? []) as EventRow[]).map(mapEvent),
  };
}
