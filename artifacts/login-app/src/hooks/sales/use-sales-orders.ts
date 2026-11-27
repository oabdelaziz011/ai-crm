import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  getSalesOrderDetail,
  listSalesOrdersPage,
  normalizeSalesOrdersFilters,
} from "@/lib/sales-orders/sales-orders-query";
import type { SalesOrdersListFilters } from "@/lib/sales-orders/sales-order-types";

export const SALES_ORDERS_LIST_KEY = ["sales", "orders", "list"] as const;
export const SALES_ORDER_DETAIL_KEY = ["sales", "orders", "detail"] as const;

export function salesOrdersListKey(companyId: string | null, filters: SalesOrdersListFilters) {
  return [...SALES_ORDERS_LIST_KEY, companyId, filters] as const;
}

export function salesOrderDetailKey(companyId: string | null, orderId: string | null) {
  return [...SALES_ORDER_DETAIL_KEY, companyId, orderId] as const;
}

export function useSalesOrdersList(
  companyId: string | null,
  filtersInput: Partial<SalesOrdersListFilters>,
) {
  const filters = normalizeSalesOrdersFilters(filtersInput);
  return useQuery({
    queryKey: salesOrdersListKey(companyId, filters),
    enabled: Boolean(companyId),
    queryFn: async () => {
      if (!companyId) throw new Error("Company required");
      return listSalesOrdersPage(supabase, companyId, filters);
    },
  });
}

export function useSalesOrderDetail(companyId: string | null, orderId: string | null) {
  return useQuery({
    queryKey: salesOrderDetailKey(companyId, orderId),
    enabled: Boolean(companyId && orderId),
    queryFn: async () => {
      if (!companyId || !orderId) return null;
      return getSalesOrderDetail(supabase, companyId, orderId);
    },
  });
}
