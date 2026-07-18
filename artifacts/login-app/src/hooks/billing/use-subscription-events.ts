import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SubscriptionEvent } from "@/lib/billing/types";

export function useSubscriptionEvents(subscriptionId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["billing", "subscription-events", subscriptionId],
    enabled: enabled && Boolean(subscriptionId),
    queryFn: async (): Promise<SubscriptionEvent[]> => {
      if (!subscriptionId) return [];
      const { data, error } = await supabase
        .from("subscription_events")
        .select("*")
        .eq("subscription_id", subscriptionId)
        .order("occurred_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as SubscriptionEvent[];
    },
  });
}
