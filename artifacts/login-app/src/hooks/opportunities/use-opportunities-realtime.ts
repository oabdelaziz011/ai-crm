import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const OPPORTUNITY_WATCHED_TABLES = [
  "opportunities",
  "opportunity_history",
  "opportunity_stages",
] as const;

/** Realtime invalidation for opportunity pipeline board and Opportunity360. */
export function useOpportunitiesRealtime(companyId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase.channel(`opportunities-workspace:${companyId}`);

    for (const table of OPPORTUNITY_WATCHED_TABLES) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["opportunities-workspace"] });
          void qc.invalidateQueries({ queryKey: ["opportunity360-workspace"] });
        },
      );
    }

    void channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, qc]);
}
