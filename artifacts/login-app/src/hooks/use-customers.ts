import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth-context";
import { CUSTOMER_LIST_COLUMNS } from "@/lib/crm/crm-query-columns";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import type { Customer, CustomerInsert, CustomerUpdate } from "@/lib/types";
import { SIDEBAR_BADGES_KEY } from "@/hooks/use-sidebar-badge-counts";
import { customerKey } from "./use-customer";

export const CUSTOMERS_KEY = ["customers"] as const;

export function customersListKey(companyId: string | null | undefined) {
  return [...CUSTOMERS_KEY, companyId ?? "none"] as const;
}

export function useCustomers() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  return useQuery({
    queryKey: customersListKey(companyId),
    enabled: Boolean(user),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase
        .from("customers")
        .select(CUSTOMER_LIST_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
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
