import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const LEADS_WATCHED_TABLES = ["leads", "lead_stages", "lead_tag_assignments", "entity_activities"] as const;

/** Realtime invalidation for leads workspace and Lead360. */
export function useLeadsRealtime(companyId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase.channel(`leads-workspace:${companyId}`);

    for (const table of LEADS_WATCHED_TABLES) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: table === "lead_stages" ? undefined : `company_id=eq.${companyId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["leads-workspace"] });
          void qc.invalidateQueries({ queryKey: ["lead360-workspace"] });
        },
      );
    }

    void channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, qc]);
}
