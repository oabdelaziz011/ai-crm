import type { SupabaseClient } from "@supabase/supabase-js";
import { OPEN_TICKET_STATUSES, type TicketPriority, type TicketStatus } from "@workspace/ticket-platform";

/**
 * Compact ticket context for Omnichannel (conversation-linked, company-scoped).
 * Authoritative active ticket = newest open ticket for the conversation
 * (matches listByConversation order: created_at desc).
 */
export type ConversationTicketContext = {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  slaDueAt: string | null;
  isActive: boolean;
};

function asTicketStatus(value: unknown): TicketStatus | null {
  if (
    value === "open" ||
    value === "in_progress" ||
    value === "waiting_customer" ||
    value === "resolved" ||
    value === "closed"
  ) {
    return value;
  }
  return null;
}

function asTicketPriority(value: unknown): TicketPriority {
  if (value === "urgent" || value === "high" || value === "low" || value === "normal") {
    return value;
  }
  return "normal";
}

const OPEN_STATUS_SET = new Set<string>(OPEN_TICKET_STATUSES);

/**
 * Single batched query — no per-conversation round trips.
 * Enforces company_id + conversation_id; only SLA-active (open) tickets.
 */
export async function batchConversationActiveTicketContexts(input: {
  client: SupabaseClient;
  companyId: string;
  conversationIds: string[];
}): Promise<Map<string, ConversationTicketContext>> {
  const companyId = input.companyId.trim();
  const ids = [...new Set(input.conversationIds.map((id) => id.trim()).filter(Boolean))];
  const result = new Map<string, ConversationTicketContext>();
  if (!companyId || ids.length === 0) return result;

  const { data, error } = await input.client
    .from("support_tickets")
    .select(
      "id, ticket_number, subject, status, priority, sla_due_at, conversation_id, company_id, created_at",
    )
    .eq("company_id", companyId)
    .in("conversation_id", ids)
    .in("status", [...OPEN_TICKET_STATUSES])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[omnichannel-ticket-context] batch load failed", { companyId, error: error.message });
    return result;
  }

  for (const row of data ?? []) {
    const conversationId =
      typeof row.conversation_id === "string" ? row.conversation_id.trim() : "";
    if (!conversationId || result.has(conversationId)) continue;
    if (String(row.company_id ?? "") !== companyId) continue;
    const status = asTicketStatus(row.status);
    if (!status || !OPEN_STATUS_SET.has(status)) continue;

    const ticketNumber =
      typeof row.ticket_number === "string" && row.ticket_number.trim()
        ? row.ticket_number.trim()
        : String(row.id);
    const slaRaw = row.sla_due_at;
    result.set(conversationId, {
      ticketId: String(row.id),
      ticketNumber,
      subject: typeof row.subject === "string" ? row.subject : "",
      status,
      priority: asTicketPriority(row.priority),
      slaDueAt: typeof slaRaw === "string" && slaRaw.trim() ? slaRaw : null,
      isActive: true,
    });
  }

  return result;
}

export function attachTicketContextsToConversations<T extends { id: string; ticketContext?: ConversationTicketContext | null }>(
  conversations: T[],
  byConversationId: ReadonlyMap<string, ConversationTicketContext>,
): T[] {
  if (byConversationId.size === 0) {
    return conversations.map((c) => ({ ...c, ticketContext: c.ticketContext ?? null }));
  }
  return conversations.map((c) => ({
    ...c,
    ticketContext: byConversationId.get(c.id) ?? null,
  }));
}
