import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Invoice, InvoiceInsert, InvoiceUpdate } from "@/lib/types";

export const INVOICES_KEY = ["invoices"] as const;

export function useInvoices() {
  return useQuery({
    queryKey: INVOICES_KEY,
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, customers(id, name)")
        .order("invoice_date", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Invoice[];
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
    onSuccess: () => qc.invalidateQueries({ queryKey: INVOICES_KEY }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: INVOICES_KEY }),
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: INVOICES_KEY }),
  });
}
