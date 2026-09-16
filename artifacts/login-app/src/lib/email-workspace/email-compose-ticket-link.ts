/**
 * Company + customer scoped open tickets for New Email ticket linking.
 * Never crosses company boundaries.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type CustomerOpenTicketOption = {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  slaDueAt: string | null;
};

const OPEN_STATUSES = ["open", "in_progress", "waiting_customer"] as const;

export async function listCompanyCustomerOpenTickets(input: {
  client: SupabaseClient;
  companyId: string;
  customerId: string;
}): Promise<CustomerOpenTicketOption[]> {
  const companyId = input.companyId.trim();
  const customerId = input.customerId.trim();
  if (!companyId || !customerId) return [];

  const { data, error } = await input.client
    .from("support_tickets")
    .select("id, ticket_number, subject, status, priority, sla_due_at, company_id, customer_id")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .in("status", [...OPEN_STATUSES])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) return [];

  return (data ?? [])
    .filter((row) => String(row.company_id ?? "") === companyId)
    .filter((row) => String(row.customer_id ?? "") === customerId)
    .map((row) => ({
      id: String(row.id),
      ticketNumber:
        typeof row.ticket_number === "string" && row.ticket_number.trim()
          ? row.ticket_number.trim()
          : String(row.id),
      subject: typeof row.subject === "string" ? row.subject : "",
      status: String(row.status ?? ""),
      priority: String(row.priority ?? "normal"),
      slaDueAt:
        typeof row.sla_due_at === "string" && row.sla_due_at.trim() ? row.sla_due_at : null,
    }));
}

/**
 * Attach an existing open ticket to this conversation (company + customer scoped).
 * Does not create tickets. Rejects cross-company/cross-customer updates.
 */
export async function linkOpenTicketToConversation(input: {
  client: SupabaseClient;
  companyId: string;
  customerId: string;
  conversationId: string;
  ticketId: string;
}): Promise<{ ok: true } | { ok: false; reason: "not_found" | "forbidden" | "error" }> {
  const companyId = input.companyId.trim();
  const customerId = input.customerId.trim();
  const conversationId = input.conversationId.trim();
  const ticketId = input.ticketId.trim();
  if (!companyId || !customerId || !conversationId || !ticketId) {
    return { ok: false, reason: "forbidden" };
  }

  const { data: existing, error: loadError } = await input.client
    .from("support_tickets")
    .select("id, company_id, customer_id, status")
    .eq("id", ticketId)
    .is("deleted_at", null)
    .maybeSingle();

  if (loadError) return { ok: false, reason: "error" };
  if (!existing) return { ok: false, reason: "not_found" };
  if (String(existing.company_id) !== companyId || String(existing.customer_id) !== customerId) {
    return { ok: false, reason: "forbidden" };
  }

  const { error } = await input.client
    .from("support_tickets")
    .update({
      conversation_id: conversationId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId)
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .is("deleted_at", null);

  if (error) return { ok: false, reason: "error" };
  return { ok: true };
}

/** Pure guard used by tests — browser cannot inject another company/customer ticket. */
export function assertTicketLinkScope(input: {
  companyId: string;
  customerId: string;
  ticket: { companyId: string; customerId: string };
}): boolean {
  return (
    input.companyId.trim() === input.ticket.companyId.trim() &&
    input.customerId.trim() === input.ticket.customerId.trim()
  );
}
