export const SALES_ORDER_STATUSES = [
  "draft",
  "pending_approval",
  "confirmed",
  "processing",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export const SALES_ORDER_PAYMENT_METHODS = ["cash_on_delivery"] as const;
export type SalesOrderPaymentMethod = (typeof SALES_ORDER_PAYMENT_METHODS)[number];

export const SALES_ORDERS_PAGE_SIZES = [10, 25, 50] as const;
export type SalesOrdersPageSize = (typeof SALES_ORDERS_PAGE_SIZES)[number];

export type SalesOrderItem = {
  id: string;
  productId: string | null;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
};

export type SalesOrderStatusEvent = {
  id: string;
  fromStatus: SalesOrderStatus | null;
  toStatus: SalesOrderStatus;
  note: string;
  changedBy: string | null;
  createdAt: string;
};

export type SalesOrderListRow = {
  id: string;
  orderNumber: string;
  status: SalesOrderStatus;
  paymentMethod: SalesOrderPaymentMethod;
  customerName: string;
  customerPhone: string;
  itemsSummary: string;
  itemCount: number;
  deliveryFee: number;
  totalAmount: number;
  currency: string;
  createdAt: string;
};

export type SalesOrderDetail = SalesOrderListRow & {
  customerId: string | null;
  conversationId: string | null;
  deliveryZoneId: string | null;
  deliveryGovernorate: string;
  deliveryCityArea: string;
  deliveryAddress: string;
  deliveryNotes: string;
  subtotal: number;
  requireHumanApproval: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  items: SalesOrderItem[];
  statusHistory: SalesOrderStatusEvent[];
};

export type SalesOrdersListFilters = {
  search: string;
  status: SalesOrderStatus | "all";
  paymentMethod: SalesOrderPaymentMethod | "all";
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: SalesOrdersPageSize;
};

export type SalesOrdersListPage = {
  items: SalesOrderListRow[];
  total: number;
  page: number;
  pageSize: SalesOrdersPageSize;
  totalPages: number;
};

export function isSalesOrderStatus(value: string): value is SalesOrderStatus {
  return (SALES_ORDER_STATUSES as readonly string[]).includes(value);
}

export function isSalesOrderPaymentMethod(value: string): value is SalesOrderPaymentMethod {
  return (SALES_ORDER_PAYMENT_METHODS as readonly string[]).includes(value);
}

export function normalizeSalesOrdersPageSize(value: unknown): SalesOrdersPageSize {
  const n = Number(value);
  if (n === 10 || n === 25 || n === 50) return n;
  return 25;
}

/** Build a compact 1 … N page window for numbered pagination controls. */
export function buildNumberedPageWindow(page: number, totalPages: number, radius = 2): Array<number | "ellipsis"> {
  const safeTotal = Math.max(1, totalPages);
  const current = Math.min(Math.max(1, page), safeTotal);
  if (safeTotal <= 7) {
    return Array.from({ length: safeTotal }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, safeTotal, current]);
  for (let i = current - radius; i <= current + radius; i += 1) {
    if (i >= 1 && i <= safeTotal) pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | "ellipsis"> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const value = sorted[i]!;
    if (i > 0 && value - sorted[i - 1]! > 1) out.push("ellipsis");
    out.push(value);
  }
  return out;
}
