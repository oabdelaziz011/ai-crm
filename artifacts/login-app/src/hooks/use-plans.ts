import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Plan } from "@/lib/types";

export const PLANS_KEY = ["plans"] as const;

export function usePlans(enabled = true) {
  return useQuery({
    queryKey: PLANS_KEY,
    enabled,
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("price_monthly", { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as Plan[];
    },
  });
}
