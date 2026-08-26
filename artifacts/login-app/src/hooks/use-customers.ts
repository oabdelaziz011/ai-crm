import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession, useUser } from "@/context/auth-context";
import { CUSTOMER_LIST_COLUMNS } from "@/lib/crm/crm-query-columns";
import { CRM_ENRICHMENT_MAX_ROWS, CRM_LIST_MAX_ROWS, CRM_LIST_PAGE_SIZE } from "@/lib/crm/crm-list-config";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import { flattenInfinitePages } from "@/lib/react-query/infinite-utils";
import type { Customer, CustomerInsert, CustomerUpdate } from "@/lib/types";
import { SIDEBAR_BADGES_KEY } from "@/hooks/use-sidebar-badge-counts";
import { customerKey } from "./use-customer";

export const CUSTOMERS_KEY = ["customers"] as const;

export function customersListKey(companyId: string | null | undefined) {
  return [...CUSTOMERS_KEY, companyId ?? "none"] as const;
}

export type CustomersPage = {
  rows: Customer[];
  nextOffset: number | null;
};

async function fetchCustomersPage(offset: number, limit: number): Promise<CustomersPage> {
  const from = offset;
  const to = offset + limit - 1;
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Customer[];
  return {
    rows,
    nextOffset: rows.length < limit ? null : offset + limit,
  };
}

/** Bounded list for dashboards and cross-entity enrichment. */
export function useCustomers(maxRows = CRM_LIST_MAX_ROWS) {
  const { user } = useSession();
  const { profile } = useUser();
  const companyId = profile?.company_id ?? null;

  return useQuery({
    queryKey: [...customersListKey(companyId), "bounded", maxRows],
    enabled: Boolean(user),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<Customer[]> => {
      const page = await fetchCustomersPage(0, maxRows);
      return page.rows;
    },
  });
}

/** Lightweight customer list for dropdowns and label enrichment. */
export function useCustomersEnrichment() {
  return useCustomers(CRM_ENRICHMENT_MAX_ROWS);
}

/** Infinite scroll for the customers list workspace. */
export function useCustomersInfinite(pageSize = CRM_LIST_PAGE_SIZE) {
  const { user } = useSession();
  const { profile } = useUser();
  const companyId = profile?.company_id ?? null;

  return useInfiniteQuery({
    queryKey: [...customersListKey(companyId), "infinite", pageSize],
    enabled: Boolean(user),
    staleTime: APP_QUERY_STALE_MS,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchCustomersPage(pageParam, pageSize),
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  });
}

/** Flattened rows from useCustomersInfinite. */
export function useCustomersInfiniteRows(pageSize = CRM_LIST_PAGE_SIZE) {
  const query = useCustomersInfinite(pageSize);
  const rows = flattenInfinitePages(query.data?.pages.map((page) => page.rows));
  return { ...query, rows };
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: CustomerInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("customers")
        .insert({ ...values, user_id: user.id })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Customer;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
      qc.invalidateQueries({ queryKey: customerKey(data.id) });
    },
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: CustomerUpdate }) => {
      const { data, error } = await supabase
        .from("customers")
        .update(values)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Customer;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
      qc.invalidateQueries({ queryKey: customerKey(data.id) });
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
    },
  });
}

import {
  buildCustomerDeleteWarningAr,
  type CustomerDeleteDependencySummary,
} from "@/lib/customers-list/customer-delete-warning";

export type { CustomerDeleteDependencySummary };

/** Preflight counts for delete warnings — does not mutate. */
export async function fetchCustomerDeleteDependencies(
  customerId: string,
): Promise<CustomerDeleteDependencySummary> {
  const nowIso = new Date().toISOString();
  const [bookingsRes, futureRes, ticketsRes] = await Promise.all([
    supabase
      .from("scheduling_bookings")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .is("deleted_at", null),
    supabase
      .from("scheduling_bookings")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .is("deleted_at", null)
      .in("status", ["pending", "confirmed"])
      .gte("start_at", nowIso),
    supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .in("status", ["open", "in_progress", "waiting_customer"]),
  ]);

  if (bookingsRes.error) throw new Error(bookingsRes.error.message);
  if (futureRes.error) throw new Error(futureRes.error.message);
  if (ticketsRes.error) throw new Error(ticketsRes.error.message);

  return {
    bookingCount: bookingsRes.count ?? 0,
    futureBookingCount: futureRes.count ?? 0,
    openTicketCount: ticketsRes.count ?? 0,
  };
}

export { buildCustomerDeleteWarningAr };
