import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTicketServiceContext } from "@/hooks/tickets/use-ticket-services";
import { ticketsQueryKey } from "@/hooks/tickets/use-tickets";

export type TicketCustomerContext = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  previousTickets: Array<{
    id: string;
    ticketNumber: string;
    subject: string;
    status: string;
    priority: string;
    createdAt: string;
  }>;
};

export function useTicketCustomerContext(customerId: string | null | undefined) {
  const { companyId, canView, buildContext, platform } = useTicketServiceContext();

  return useQuery({
    queryKey: ticketsQueryKey.customerContext(companyId, customerId ?? null),
    enabled: Boolean(companyId && customerId && canView),
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<TicketCustomerContext | null> => {
      if (!companyId || !customerId) return null;

      const [{ data: customer, error: customerError }, previous] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, email, phone")
          .eq("company_id", companyId)
          .eq("id", customerId)
          .maybeSingle(),
        platform().queries.listCustomerTickets(buildContext(), {
          companyId,
          customerId,
          limit: 8,
        }),
      ]);

      if (customerError) throw new Error(customerError.message);
      if (!customer) return null;

      return {
        id: String(customer.id),
        name: String(customer.name ?? "").trim() || customerId,
        email: customer.email ? String(customer.email) : null,
        phone: customer.phone ? String(customer.phone) : null,
        previousTickets: previous.tickets.map((ticket) => ({
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          createdAt: ticket.createdAt,
        })),
      };
    },
  });
}
