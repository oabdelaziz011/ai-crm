import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTicketServiceContext } from "@/hooks/tickets/use-ticket-services";
import { ticketsQueryKey } from "@/hooks/tickets/use-tickets";
import {
  assertTicketAuditRowInScope,
  buildTicketAuditQueryScope,
} from "@/lib/tickets/ticket360-tab-models";

export type TicketAuditEntry = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

/** Real audit trail from audit_logs (DB triggers on support_tickets / comments). */
export function useTicketAuditTrail(ticketId: string | null) {
  const { companyId, canView } = useTicketServiceContext();

  return useQuery({
    queryKey: ticketsQueryKey.audit(companyId, ticketId),
    enabled: Boolean(companyId && ticketId && canView),
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<TicketAuditEntry[]> => {
      if (!companyId || !ticketId) return [];
      const scope = buildTicketAuditQueryScope(companyId, ticketId);
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, user_id, action, entity, entity_id, metadata, created_at, company_id")
        .eq("company_id", scope.companyId)
        .in("entity", [...scope.entities])
        .eq("entity_id", scope.entityId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data ?? [])
        .filter((row) =>
          assertTicketAuditRowInScope(
            {
              companyId: row.company_id ? String(row.company_id) : null,
              entityId: row.entity_id ? String(row.entity_id) : null,
              entity: row.entity ? String(row.entity) : null,
            },
            companyId,
            ticketId,
          ),
        )
        .map((row) => ({
          id: String(row.id),
          action: String(row.action ?? ""),
          entity: String(row.entity ?? ""),
          entityId: row.entity_id ? String(row.entity_id) : null,
          userId: row.user_id ? String(row.user_id) : null,
          createdAt: String(row.created_at),
          metadata: (row.metadata as Record<string, unknown> | null) ?? null,
        }));
    },
  });
}
