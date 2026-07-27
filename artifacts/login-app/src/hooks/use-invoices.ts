import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth-context";
import { INVOICE_LIST_COLUMNS } from "@/lib/crm/crm-query-columns";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import type { Invoice, InvoiceInsert, InvoiceUpdate } from "@/lib/types";
import { SIDEBAR_BADGES_KEY } from "@/hooks/use-sidebar-badge-counts";

export const INVOICES_KEY = ["invoices"] as const;

export function invoicesListKey(companyId: string | null | undefined) {
  return [...INVOICES_KEY, companyId ?? "none"] as const;
}

export function useInvoices() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  return useQuery({
    queryKey: invoicesListKey(companyId),
    enabled: Boolean(user),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select(INVOICE_LIST_COLUMNS)
        .order("invoice_date", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Invoice[];
    },
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: InvoiceInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("invoices")
        .insert({ ...values, user_id: user.id })
        .select("*, customers(id, name)")
        .single();
      if (error) throw new Error(error.message);
      return data as Invoice;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVOICES_KEY });
      qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
    },
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: InvoiceUpdate }) => {
      const { data, error } = await supabase
        .from("invoices")
        .update(values)
        .eq("id", id)
        .select("*, customers(id, name)")
        .single();
      if (error) throw new Error(error.message);
      return data as Invoice;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVOICES_KEY });
      qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
    },
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVOICES_KEY });
      qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
    },
  });
}
