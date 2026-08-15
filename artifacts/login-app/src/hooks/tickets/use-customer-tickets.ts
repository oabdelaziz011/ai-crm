import { useQuery } from "@tanstack/react-query";
import type { TicketSummary } from "@workspace/ticket-platform";
import { useTicketServiceContext } from "@/hooks/tickets/use-ticket-services";
import { ticketsQueryKey } from "@/hooks/tickets/use-tickets";

/** All tickets linked to a customer (customer workspace / profile). */
export function useCustomerTickets(customerId: string | null | undefined, limit = 100) {
  const { companyId, canView, buildContext, platform } = useTicketServiceContext();

  return useQuery({
    queryKey: [...ticketsQueryKey.all(companyId), "customer-tickets", customerId, limit] as const,
    enabled: Boolean(companyId && customerId && canView),
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<TicketSummary[]> => {
      if (!companyId || !customerId) return [];
      const result = await platform().queries.listCustomerTickets(buildContext(), {
        companyId,
        customerId,
        limit,
      });
      return result.tickets;
    },
  });
}
