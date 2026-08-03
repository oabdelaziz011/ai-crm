import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OPEN_TICKET_STATUSES,
  TERMINAL_TICKET_STATUSES,
} from "../constants.js";
import {
  TicketAssigneeAmbiguousError,
  TicketAssigneeNotFoundError,
} from "../errors.js";
import type { TicketAssigneeResolverPort } from "../ports/ticket-platform-ports.js";
import type {
  CreateTicketRepositoryInput,
  TicketCommentRepository,
  TicketRepository,
  UpdateTicketRepositoryInput,
  AddCommentRepositoryInput,
} from "./ticket-repository-port.js";
import type {
  CustomerTicketSnapshot,
  TicketCommentRecord,
  TicketMetricsSnapshot,
  TicketPriority,
  TicketRecord,
  TicketSearchFilters,
  TicketStatus,
  toTicketSummary,
} from "../types/ticket-types.js";
import { toTicketSummary as mapSummary } from "../types/ticket-types.js";

function mapTicketRow(
  row: Record<string, unknown>,
  assigneeName: string | null = null,
): TicketRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    ticketNumber: String(row.ticket_number),
    subject: String(row.subject),
    description: String(row.description ?? ""),
    status: String(row.status) as TicketStatus,
    priority: String(row.priority) as TicketPriority,
    customerId: row.customer_id ? String(row.customer_id) : null,
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    assignedUserId: row.assigned_user_id ? String(row.assigned_user_id) : null,
    assignedUserName: assigneeName,
    createdBy: row.created_by ? String(row.created_by) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    closedAt: row.closed_at ? String(row.closed_at) : null,
    closedBy: row.closed_by ? String(row.closed_by) : null,
    reopenedAt: row.reopened_at ? String(row.reopened_at) : null,
    reopenedBy: row.reopened_by ? String(row.reopened_by) : null,
    slaDueAt: row.sla_due_at ? String(row.sla_due_at) : null,
    firstResponseAt: row.first_response_at ? String(row.first_response_at) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  };
}

function mapCommentRow(row: Record<string, unknown>): TicketCommentRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    ticketId: String(row.ticket_id),
    body: String(row.body),
    isInternal: row.is_internal === true,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
  };
}

export function createSupabaseTicketAssigneeResolver(client: SupabaseClient): TicketAssigneeResolverPort {
  return {
    async resolveAssigneeUserId(input) {
      if (input.assigneeUserId?.trim()) return input.assigneeUserId.trim();
      const name = input.assigneeName?.trim();
      if (!name) throw new TicketAssigneeNotFoundError("assignee");

      const { data, error } = await client
        .from("profiles")
        .select("id, full_name, email")
        .eq("company_id", input.companyId)
        .or(`full_name.ilike.%${name}%,email.ilike.%${name}%`)
        .limit(5);

      if (error) throw new Error(error.message);

      const matches = (data ?? []).filter((row) => {
        const fullName = String(row.full_name ?? "").toLowerCase();
        const email = String(row.email ?? "").toLowerCase();
        const needle = name.toLowerCase();
        return fullName.includes(needle) || email.includes(needle);
      });

      if (matches.length === 0) throw new TicketAssigneeNotFoundError(name);
      if (matches.length > 1) throw new TicketAssigneeAmbiguousError(name);
      return String(matches[0]!.id);
    },

    async loadAssigneeNames(userIds) {
      if (userIds.length === 0) return new Map();
      const { data, error } = await client
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      if (error) throw new Error(error.message);

      const map = new Map<string, string>();
      for (const row of data ?? []) {
        const label =
          (row.full_name as string | null)?.trim() ||
          (row.email as string | null)?.trim() ||
          String(row.id);
        map.set(String(row.id), label);
      }
      return map;
    },

    async findAssigneeCandidates(companyId, assigneeName) {
      const { data, error } = await client
        .from("profiles")
        .select("id, full_name, email")
        .eq("company_id", companyId)
        .or(`full_name.ilike.%${assigneeName}%,email.ilike.%${assigneeName}%`);
      if (error) throw new Error(error.message);

      return (data ?? [])
        .filter((row) => {
          const fullName = String(row.full_name ?? "").toLowerCase();
          const email = String(row.email ?? "").toLowerCase();
          const needle = assigneeName.toLowerCase();
          return fullName.includes(needle) || email.includes(needle);
        })
        .map((row) => String(row.id));
    },
  };
}

async function hydrateAssigneeNames(
  client: SupabaseClient,
  records: TicketRecord[],
): Promise<TicketRecord[]> {
  const assigneeIds = [
    ...new Set(records.map((r) => r.assignedUserId).filter(Boolean) as string[]),
  ];
  if (assigneeIds.length === 0) return records;

  const resolver = createSupabaseTicketAssigneeResolver(client);
  const names = await resolver.loadAssigneeNames(assigneeIds);
  return records.map((record) => ({
    ...record,
    assignedUserName: record.assignedUserId
      ? names.get(record.assignedUserId) ?? null
      : null,
  }));
}

export function createSupabaseTicketRepository(client: SupabaseClient): TicketRepository {
  return {
    async generateTicketNumber(companyId) {
      const { data, error } = await client.rpc("generate_support_ticket_number", {
        p_company_id: companyId,
      });
      if (error) throw new Error(error.message);
      return String(data);
    },

    async create(input) {
      const { data, error } = await client
        .from("support_tickets")
        .insert({
          company_id: input.companyId,
          ticket_number: input.ticketNumber,
          subject: input.subject,
          description: input.description,
          priority: input.priority,
          status: input.status,
          customer_id: input.customerId ?? null,
          conversation_id: input.conversationId ?? null,
          created_by: input.createdBy,
          updated_by: input.createdBy,
          sla_due_at: input.slaDueAt,
          metadata: input.metadata ?? {},
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapTicketRow(data as Record<string, unknown>);
    },

    async update(input) {
      const patch: Record<string, unknown> = { updated_by: input.updatedBy };
      if (input.subject != null) patch.subject = input.subject;
      if (input.description != null) patch.description = input.description;
      if (input.status != null) patch.status = input.status;
      if (input.priority != null) patch.priority = input.priority;
      if (input.assignedUserId !== undefined) patch.assigned_user_id = input.assignedUserId;
      if (input.closedAt !== undefined) patch.closed_at = input.closedAt;
      if (input.closedBy !== undefined) patch.closed_by = input.closedBy;
      if (input.reopenedAt !== undefined) patch.reopened_at = input.reopenedAt;
      if (input.reopenedBy !== undefined) patch.reopened_by = input.reopenedBy;
      if (input.firstResponseAt !== undefined) patch.first_response_at = input.firstResponseAt;
      if (input.resolvedAt !== undefined) patch.resolved_at = input.resolvedAt;
      if (input.slaDueAt !== undefined) patch.sla_due_at = input.slaDueAt;
      if (input.metadata != null) patch.metadata = input.metadata;

      const { data, error } = await client
        .from("support_tickets")
        .update(patch)
        .eq("company_id", input.companyId)
        .eq("id", input.ticketId)
        .is("deleted_at", null)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      const [hydrated] = await hydrateAssigneeNames(client, [mapTicketRow(data as Record<string, unknown>)]);
      return hydrated!;
    },

    async softDelete(companyId, ticketId, deletedBy) {
      const { data, error } = await client
        .from("support_tickets")
        .update({
          deleted_at: new Date().toISOString(),
          updated_by: deletedBy,
        })
        .eq("company_id", companyId)
        .eq("id", ticketId)
        .is("deleted_at", null)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapTicketRow(data as Record<string, unknown>);
    },

    async findById(companyId, ticketId) {
      const { data, error } = await client
        .from("support_tickets")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", ticketId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;

      const [hydrated] = await hydrateAssigneeNames(client, [mapTicketRow(data as Record<string, unknown>)]);
      return hydrated ?? null;
    },

    async search(filters) {
      let query = client
        .from("support_tickets")
        .select("*", { count: "exact" })
        .eq("company_id", filters.companyId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });

      if (filters.status) query = query.eq("status", filters.status);
      if (filters.priority) query = query.eq("priority", filters.priority);
      if (filters.customerId) query = query.eq("customer_id", filters.customerId);
      if (filters.conversationId) query = query.eq("conversation_id", filters.conversationId);
      if (filters.assignedUserId) query = query.eq("assigned_user_id", filters.assignedUserId);

      const keyword = filters.query?.trim();
      if (keyword) {
        query = query.or(
          `subject.ilike.%${keyword}%,description.ilike.%${keyword}%,ticket_number.ilike.%${keyword}%`,
        );
      }

      const limit = filters.limit ?? 20;
      const offset = filters.offset ?? 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);

      let rows = (data ?? []).map((row) => mapTicketRow(row as Record<string, unknown>));

      if (filters.assigneeName?.trim()) {
        const resolver = createSupabaseTicketAssigneeResolver(client);
        const assigneeIds = await resolver.findAssigneeCandidates(filters.companyId, filters.assigneeName.trim());
        rows = rows.filter((row) =>
          row.assignedUserId ? assigneeIds.includes(row.assignedUserId) : false,
        );
      }

      const hydrated = await hydrateAssigneeNames(client, rows);
      return {
        tickets: hydrated,
        total: filters.assigneeName ? hydrated.length : (count ?? hydrated.length),
      };
    },

    async listByCustomer(companyId, customerId, limit = 50) {
      const { data, error } = await client
        .from("support_tickets")
        .select("*")
        .eq("company_id", companyId)
        .eq("customer_id", customerId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return hydrateAssigneeNames(
        client,
        (data ?? []).map((row) => mapTicketRow(row as Record<string, unknown>)),
      );
    },

    async listByConversation(companyId, conversationId) {
      const { data, error } = await client
        .from("support_tickets")
        .select("*")
        .eq("company_id", companyId)
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return hydrateAssigneeNames(
        client,
        (data ?? []).map((row) => mapTicketRow(row as Record<string, unknown>)),
      );
    },

    async countOpenByCustomer(companyId, customerId) {
      const { count, error } = await client
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("customer_id", customerId)
        .in("status", [...OPEN_TICKET_STATUSES])
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },

    async fetchCustomerSnapshot(companyId, customerId) {
      const [countResult, openRows, closedRows, lastRow] = await Promise.all([
        client
          .from("support_tickets")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("customer_id", customerId)
          .is("deleted_at", null),
        client
          .from("support_tickets")
          .select("*")
          .eq("company_id", companyId)
          .eq("customer_id", customerId)
          .in("status", [...OPEN_TICKET_STATUSES])
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(25),
        client
          .from("support_tickets")
          .select("*")
          .eq("company_id", companyId)
          .eq("customer_id", customerId)
          .in("status", [...TERMINAL_TICKET_STATUSES])
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(25),
        client
          .from("support_tickets")
          .select("*")
          .eq("company_id", companyId)
          .eq("customer_id", customerId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (countResult.error) throw new Error(countResult.error.message);
      if (openRows.error) throw new Error(openRows.error.message);
      if (closedRows.error) throw new Error(closedRows.error.message);
      if (lastRow.error) throw new Error(lastRow.error.message);

      const openHydrated = await hydrateAssigneeNames(
        client,
        (openRows.data ?? []).map((row) => mapTicketRow(row as Record<string, unknown>)),
      );
      const closedHydrated = await hydrateAssigneeNames(
        client,
        (closedRows.data ?? []).map((row) => mapTicketRow(row as Record<string, unknown>)),
      );
      const lastHydrated = lastRow.data
        ? (
            await hydrateAssigneeNames(client, [
              mapTicketRow(lastRow.data as Record<string, unknown>),
            ])
          )[0] ?? null
        : null;

      return {
        openTickets: openHydrated.map(mapSummary),
        closedTickets: closedHydrated.map(mapSummary),
        lastTicket: lastHydrated ? mapSummary(lastHydrated) : null,
        ticketCount: countResult.count ?? 0,
      };
    },

    async fetchMetrics(companyId, todayStartIso) {
      const { data, error } = await client.rpc("ticket_platform_company_metrics_v1", {
        p_company_id: companyId,
        p_today_start: todayStartIso,
      });
      if (error) throw new Error(error.message);

      const payload = (data as Record<string, unknown> | null) ?? {};
      const ticketsByAgent = Array.isArray(payload.ticketsByAgent)
        ? payload.ticketsByAgent.map((row) => {
            const record = row as Record<string, unknown>;
            return {
              agentId: String(record.agentId ?? ""),
              agentName: String(record.agentName ?? record.agentId ?? ""),
              count: Number(record.count ?? 0),
            };
          })
        : [];

      return {
        openTickets: Number(payload.openTickets ?? 0),
        closedToday: Number(payload.closedToday ?? 0),
        slaCompliancePercent: Number(payload.slaCompliancePercent ?? 100),
        averageResponseMinutes: Number(payload.averageResponseMinutes ?? 0),
        averageResolutionMinutes: Number(payload.averageResolutionMinutes ?? 0),
        slaBreaches: Number(payload.slaBreaches ?? 0),
        slaBreachesOpen: Number(payload.slaBreachesOpen ?? 0),
        slaBreachesClosed: Number(payload.slaBreachesClosed ?? 0),
        ticketsByPriority: (payload.ticketsByPriority as Record<string, number>) ?? {},
        ticketsByStatus: (payload.ticketsByStatus as Record<string, number>) ?? {},
        ticketsByAgent,
      } satisfies TicketMetricsSnapshot;
    },
  };
}

export function createSupabaseTicketCommentRepository(client: SupabaseClient): TicketCommentRepository {
  return {
    async add(input) {
      const { data, error } = await client
        .from("support_ticket_comments")
        .insert({
          company_id: input.companyId,
          ticket_id: input.ticketId,
          body: input.body,
          is_internal: input.isInternal,
          created_by: input.createdBy,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapCommentRow(data as Record<string, unknown>);
    },

    async listByTicket(companyId, ticketId) {
      const { data, error } = await client
        .from("support_ticket_comments")
        .select("*")
        .eq("company_id", companyId)
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => mapCommentRow(row as Record<string, unknown>));
    },
  };
}

export type {
  CreateTicketRepositoryInput,
  UpdateTicketRepositoryInput,
  AddCommentRepositoryInput,
};
