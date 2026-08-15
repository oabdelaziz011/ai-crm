import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TicketPriority, TicketStatus } from "@workspace/ticket-platform";
import { requireCompanyFeature } from "@/lib/billing/require-company-feature";
import { enrichTicketInboxRows } from "@/lib/tickets/enrich-ticket-rows";
import { fetchTicketInboxMetrics } from "@/lib/tickets/fetch-ticket-inbox-metrics";
import { resolveTicketSlaState } from "@/lib/tickets/ticket-inbox-metrics";
import { resolveAssignedUserSearchFilter } from "@/lib/tickets/ticket-inbox-read-model";
import { supabase } from "@/lib/supabase";
import { useTicketServiceContext } from "./use-ticket-services";

export type TicketListFilters = {
  query?: string;
  status?: TicketStatus | "all";
  priority?: TicketPriority | "all";
  assignedUserId?: string | "all" | "unassigned";
  sortBy?: "updated_at" | "created_at" | "priority" | "status";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

/**
 * All ticket workspace keys nest under `all(companyId)` so any mutation can
 * invalidate the whole tree (KPIs + list + detail + audit + customer context).
 */
export const ticketsQueryKey = {
  all: (companyId: string | null) => ["tickets-workspace", companyId] as const,
  metrics: (companyId: string | null) =>
    [...ticketsQueryKey.all(companyId), "metrics"] as const,
  list: (companyId: string | null, filters: TicketListFilters) =>
    [...ticketsQueryKey.all(companyId), "list", filters] as const,
  detail: (companyId: string | null, ticketId: string | null) =>
    [...ticketsQueryKey.all(companyId), "detail", ticketId] as const,
  audit: (companyId: string | null, ticketId: string | null) =>
    [...ticketsQueryKey.all(companyId), "audit", ticketId] as const,
  customerContext: (companyId: string | null, customerId: string | null) =>
    [...ticketsQueryKey.all(companyId), "customer-context", customerId] as const,
};

const TICKET_QUERY_OPTIONS = {
  staleTime: 0,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} as const;

export function useTicketInboxMetrics() {
  const { companyId, canView } = useTicketServiceContext();
  return useQuery({
    queryKey: ticketsQueryKey.metrics(companyId),
    enabled: Boolean(companyId && canView),
    ...TICKET_QUERY_OPTIONS,
    queryFn: async () => {
      if (!companyId) throw new Error("Not authenticated");
      return fetchTicketInboxMetrics(companyId);
    },
  });
}

export function useTicketsList(filters: TicketListFilters) {
  const { companyId, canView, buildContext, platform } = useTicketServiceContext();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  return useQuery({
    queryKey: ticketsQueryKey.list(companyId, filters),
    enabled: Boolean(companyId && canView),
    ...TICKET_QUERY_OPTIONS,
    queryFn: async () => {
      if (!companyId) return { tickets: [], total: 0, page, pageSize };
      const status = filters.status && filters.status !== "all" ? filters.status : undefined;
      const priority = filters.priority && filters.priority !== "all" ? filters.priority : undefined;
      const assignee = resolveAssignedUserSearchFilter(filters.assignedUserId);

      const result = await platform().queries.searchTickets(buildContext(), {
        companyId,
        query: filters.query?.trim() || undefined,
        status,
        priority,
        assignedUserId: assignee.assignedUserId,
        unassignedOnly: assignee.unassignedOnly,
        sortBy: filters.sortBy ?? "updated_at",
        sortDir: filters.sortDir ?? "desc",
        limit: pageSize,
        offset,
      });

      const enriched = await enrichTicketInboxRows(companyId, result.tickets);
      return { tickets: enriched, total: result.total, page, pageSize };
    },
  });
}

export function useTicketDetail(ticketId: string | null) {
  const { companyId, canView, buildContext, platform } = useTicketServiceContext();

  return useQuery({
    queryKey: ticketsQueryKey.detail(companyId, ticketId),
    enabled: Boolean(companyId && ticketId && canView),
    ...TICKET_QUERY_OPTIONS,
    queryFn: async () => {
      if (!companyId || !ticketId) return null;
      const detail = await platform().queries.getTicket(buildContext(), { companyId, ticketId });
      try {
        const [enriched] = await enrichTicketInboxRows(companyId, [detail.ticket]);
        return { ...detail, ticket: enriched ?? detail.ticket };
      } catch {
        return {
          ...detail,
          ticket: {
            ...detail.ticket,
            customerName: null,
            customerPhone: null,
            customerEmail: null,
            channelType: null,
            lastCustomerActivityAt: null,
            slaState: resolveTicketSlaState({
              slaDueAt: detail.ticket.slaDueAt,
              status: detail.ticket.status,
              resolvedAt: detail.ticket.resolvedAt,
              closedAt: detail.ticket.closedAt,
            }),
          },
        };
      }
    },
  });
}

export function useTicketCommands() {
  const queryClient = useQueryClient();
  const { companyId, buildContext, platform } = useTicketServiceContext();

  /** After any ticket mutation: refresh KPIs, inbox, open Ticket 360, activity/audit. */
  const refreshTicketWorkspace = (ticketId?: string) => {
    // Invalidate without blocking the mutation — awaiting every refetch made Assign feel hung.
    void queryClient.invalidateQueries({
      queryKey: ticketsQueryKey.all(companyId),
    });
    if (ticketId) {
      void queryClient.invalidateQueries({
        queryKey: ticketsQueryKey.detail(companyId, ticketId),
      });
      void queryClient.invalidateQueries({
        queryKey: ticketsQueryKey.audit(companyId, ticketId),
      });
    }
  };

  const createTicket = useMutation({
    mutationFn: async (input: {
      subject: string;
      description?: string;
      priority?: TicketPriority;
      customerId?: string;
    }) => {
      if (!companyId) throw new Error("Not authenticated");
      await requireCompanyFeature(supabase, companyId, "ticketing");
      return platform().commands.createTicket(buildContext(), {
        companyId,
        subject: input.subject,
        description: input.description,
        priority: input.priority,
        customerId: input.customerId,
      });
    },
    onSuccess: () => refreshTicketWorkspace(),
  });

  const assignTicket = useMutation({
    mutationFn: async (input: {
      ticketId: string;
      assigneeUserId?: string;
      assigneeName?: string;
    }) => {
      if (!companyId) throw new Error("Not authenticated");
      await requireCompanyFeature(supabase, companyId, "ticketing");
      return platform().commands.assignTicket(buildContext(), {
        companyId,
        ticketId: input.ticketId,
        assigneeUserId: input.assigneeUserId,
        assigneeName: input.assigneeName,
      });
    },
    onSuccess: (result) => refreshTicketWorkspace(result.ticket.id),
  });

  const unassignTicket = useMutation({
    mutationFn: async (ticketId: string) => {
      if (!companyId) throw new Error("Not authenticated");
      await requireCompanyFeature(supabase, companyId, "ticketing");
      return platform().commands.unassignTicket(buildContext(), { companyId, ticketId });
    },
    onSuccess: (result) => refreshTicketWorkspace(result.ticket.id),
  });

  const changeStatus = useMutation({
    mutationFn: async (input: { ticketId: string; status: TicketStatus }) => {
      if (!companyId) throw new Error("Not authenticated");
      await requireCompanyFeature(supabase, companyId, "ticketing");
      if (input.status === "closed" || input.status === "resolved") {
        return platform().commands.closeTicket(buildContext(), {
          companyId,
          ticketId: input.ticketId,
          status: input.status,
        });
      }
      return platform().commands.changeStatus(buildContext(), {
        companyId,
        ticketId: input.ticketId,
        status: input.status,
      });
    },
    onSuccess: (result) => refreshTicketWorkspace(result.ticket.id),
  });

  const changePriority = useMutation({
    mutationFn: async (input: { ticketId: string; priority: TicketPriority }) => {
      if (!companyId) throw new Error("Not authenticated");
      await requireCompanyFeature(supabase, companyId, "ticketing");
      return platform().commands.changePriority(buildContext(), {
        companyId,
        ticketId: input.ticketId,
        priority: input.priority,
      });
    },
    onSuccess: (result) => refreshTicketWorkspace(result.ticket.id),
  });

  const addComment = useMutation({
    mutationFn: async (input: { ticketId: string; body: string; isInternal?: boolean }) => {
      if (!companyId) throw new Error("Not authenticated");
      await requireCompanyFeature(supabase, companyId, "ticketing");
      return platform().commands.addComment(buildContext(), {
        companyId,
        ticketId: input.ticketId,
        body: input.body,
        isInternal: input.isInternal,
      });
    },
    onSuccess: (_result, variables) => refreshTicketWorkspace(variables.ticketId),
  });

  const reopenTicket = useMutation({
    mutationFn: async (ticketId: string) => {
      if (!companyId) throw new Error("Not authenticated");
      await requireCompanyFeature(supabase, companyId, "ticketing");
      return platform().commands.reopenTicket(buildContext(), { companyId, ticketId });
    },
    onSuccess: (result) => refreshTicketWorkspace(result.ticket.id),
  });

  return {
    createTicket,
    assignTicket,
    unassignTicket,
    changeStatus,
    changePriority,
    addComment,
    reopenTicket,
  };
}
