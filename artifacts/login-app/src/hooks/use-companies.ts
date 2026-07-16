import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Company, CompanyInsert, CompanyUpdate } from "@/lib/types";

export const COMPANIES_KEY = ["companies"] as const;

export function useCompanies(enabled = true) {
  return useQuery({
    queryKey: COMPANIES_KEY,
    enabled,
    queryFn: async (): Promise<Company[]> => {
      const { data, error } = await supabase
        .from("companies")
        .select("*, plan:plans(*)")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Company[];
    },
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: CompanyInsert) => {
      const { data, error } = await supabase
        .from("companies")
        .insert(values)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Company;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COMPANIES_KEY }),
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: CompanyUpdate }) => {
      const { data, error } = await supabase
        .from("companies")
        .update(values)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Company;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COMPANIES_KEY }),
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("companies").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COMPANIES_KEY }),
  });
}
