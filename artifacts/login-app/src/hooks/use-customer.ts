import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Customer } from "@/lib/types";
import { CUSTOMERS_KEY } from "./use-customers";

export const customerKey = (customerId: string | null | undefined) =>
  ["customer", customerId] as const;

export function useCustomer(customerId: string | null | undefined) {
  return useQuery({
    queryKey: customerKey(customerId),
    enabled: Boolean(customerId),
    queryFn: async (): Promise<Customer> => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, user_id, company_id, name, email, phone, phone_e164, phone_country_iso, phone_region_source, phone_national, age, gender, notes, created_at, updated_at")
        .eq("id", customerId!)
        .single();
      if (error) throw new Error(error.message);
      return data as Customer;
    },
  });
}

export function useCustomerRealtime(customerId: string | null | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!customerId) return;

    const channel = supabase
      .channel(`customer:${customerId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "customers",
          filter: `id=eq.${customerId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: customerKey(customerId) });
          void qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [customerId, qc]);
}
