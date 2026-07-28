import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth-context";
import { CUSTOMER_LIST_COLUMNS } from "@/lib/crm/crm-query-columns";
import { CRM_LIST_MAX_ROWS, CRM_LIST_PAGE_SIZE } from "@/lib/crm/crm-list-config";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
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
export function useCustomers() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  return useQuery({
    queryKey: [...customersListKey(companyId), "bounded", CRM_LIST_MAX_ROWS],
    enabled: Boolean(user),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<Customer[]> => {
      const page = await fetchCustomersPage(0, CRM_LIST_MAX_ROWS);
      return page.rows;
    },
  });
}

/** Infinite scroll for the customers list workspace. */
export function useCustomersInfinite(pageSize = CRM_LIST_PAGE_SIZE) {
  const { user, profile } = useAuth();
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
