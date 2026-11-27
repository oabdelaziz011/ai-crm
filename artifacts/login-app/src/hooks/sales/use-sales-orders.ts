import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  approveSalesOrder,
  getSalesOrderDetail,
  listCustomerSalesOrderHistory,
  listSalesOrdersPage,
  normalizeSalesOrdersFilters,
  rejectSalesOrder,
} from "@/lib/sales-orders/sales-orders-query";
import type { SalesOrdersListFilters } from "@/lib/sales-orders/sales-order-types";

export const SALES_ORDERS_LIST_KEY = ["sales", "orders", "list"] as const;
export const SALES_ORDER_DETAIL_KEY = ["sales", "orders", "detail"] as const;
export const CUSTOMER_SALES_ORDERS_KEY = ["sales", "orders", "customer"] as const;

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

export function customerSalesOrdersKey(companyId: string | null, customerId: string | null) {
  return [...CUSTOMER_SALES_ORDERS_KEY, companyId, customerId] as const;
}

export function useCustomerSalesOrderHistory(
  companyId: string | null,
  customerId: string | null,
) {
  return useQuery({
    queryKey: customerSalesOrdersKey(companyId, customerId),
    enabled: Boolean(companyId && customerId),
    queryFn: async () => {
      if (!companyId || !customerId) {
        return {
          totalOrders: 0,
          totalValue: 0,
          currency: "EGP",
          firstOrderAt: null,
          lastOrderAt: null,
          orders: [],
        };
      }
      return listCustomerSalesOrderHistory(supabase, companyId, customerId);
    },
  });
}

export function useSalesOrderApprovalActions(companyId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = async (orderId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: SALES_ORDERS_LIST_KEY }),
      queryClient.invalidateQueries({ queryKey: salesOrderDetailKey(companyId, orderId) }),
      queryClient.invalidateQueries({ queryKey: CUSTOMER_SALES_ORDERS_KEY }),
    ]);
  };

  const approve = useMutation({
    mutationFn: async (input: { orderId: string; userId: string; note?: string }) => {
      if (!companyId) throw new Error("Company required");
      await approveSalesOrder(supabase, { companyId, ...input });
    },
    onSuccess: async (_data, variables) => {
      await invalidate(variables.orderId);
    },
  });

  const reject = useMutation({
    mutationFn: async (input: { orderId: string; userId: string; note?: string }) => {
      if (!companyId) throw new Error("Company required");
      await rejectSalesOrder(supabase, { companyId, ...input });
    },
    onSuccess: async (_data, variables) => {
      await invalidate(variables.orderId);
    },
  });

  return { approve, reject };
}
