import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession, useUser } from "@/context/auth-context";
import { INVOICE_LIST_COLUMNS } from "@/lib/crm/crm-query-columns";
import { CRM_ENRICHMENT_MAX_ROWS, CRM_LIST_MAX_ROWS, CRM_LIST_PAGE_SIZE } from "@/lib/crm/crm-list-config";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import { flattenInfinitePages } from "@/lib/react-query/infinite-utils";
import type { Invoice, InvoiceInsert, InvoiceUpdate } from "@/lib/types";
import { SIDEBAR_BADGES_KEY } from "@/hooks/use-sidebar-badge-counts";

export const INVOICES_KEY = ["invoices"] as const;

export function invoicesListKey(companyId: string | null | undefined) {
  return [...INVOICES_KEY, companyId ?? "none"] as const;
}

export type InvoicesPage = {
  rows: Invoice[];
  nextOffset: number | null;
};

async function fetchInvoicesPage(offset: number, limit: number): Promise<InvoicesPage> {
  const from = offset;
  const to = offset + limit - 1;
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_LIST_COLUMNS)
    .order("invoice_date", { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Invoice[];
  return {
    rows,
    nextOffset: rows.length < limit ? null : offset + limit,
  };
}

export function useInvoices(maxRows = CRM_LIST_MAX_ROWS, options?: { enabled?: boolean }) {
  const { user } = useSession();
  const { profile } = useUser();
  const companyId = profile?.company_id ?? null;
  const enabled = (options?.enabled ?? true) && Boolean(user);

  return useQuery({
    queryKey: [...invoicesListKey(companyId), "bounded", maxRows],
    enabled,
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<Invoice[]> => {
      const page = await fetchInvoicesPage(0, maxRows);
      return page.rows;
    },
  });
}

export function useInvoicesEnrichment() {
  return useInvoices(CRM_ENRICHMENT_MAX_ROWS);
}

export function useInvoicesInfinite(pageSize = CRM_LIST_PAGE_SIZE) {
  const { user } = useSession();
  const { profile } = useUser();
  const companyId = profile?.company_id ?? null;

  return useInfiniteQuery({
    queryKey: [...invoicesListKey(companyId), "infinite", pageSize],
    enabled: Boolean(user),
    staleTime: APP_QUERY_STALE_MS,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchInvoicesPage(pageParam, pageSize),
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  });
}

export function useInvoicesInfiniteRows(pageSize = CRM_LIST_PAGE_SIZE) {
  const query = useInvoicesInfinite(pageSize);
  const rows = flattenInfinitePages(query.data?.pages.map((page) => page.rows));
  return { ...query, rows };
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
