import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { LEADS_REALTIME_INVALIDATION_KEYS } from "./leads-realtime-contract";

/**
 * One rejected binding drops every postgres_changes registration on this
 * channel, while the client still reports SUBSCRIBED. entity_activities is
 * tenant-scoped (tenant_id). Visible tags are leads.tags, so this channel
 * does not subscribe to the separate lead_tags table.
 */
const LEADS_REALTIME_BINDINGS = [
  { table: "leads", column: "company_id" },
  { table: "lead_stages", column: null },
  { table: "entity_activities", column: "tenant_id" },
] as const;

/** Realtime invalidation for leads workspace and Lead360. */
export function useLeadsRealtime(companyId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

    const invalidate = () => {
      for (const queryKey of LEADS_REALTIME_INVALIDATION_KEYS) {
        void qc.invalidateQueries({ queryKey: [...queryKey] });
      }
    };

    const channel = supabase.channel(`leads-workspace:${companyId}`);

    for (const binding of LEADS_REALTIME_BINDINGS) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: binding.table,
          filter: binding.column ? `${binding.column}=eq.${companyId}` : undefined,
        },
        invalidate,
      );
    }

    void channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, qc]);
}
