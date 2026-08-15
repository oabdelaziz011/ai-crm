import type { TicketSummary } from "@workspace/ticket-platform";
import { supabase } from "@/lib/supabase";
import { resolveTicketSlaState, type TicketSlaState } from "./ticket-inbox-metrics";

export type TicketInboxRow = TicketSummary & {
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  channelType: string | null;
  lastCustomerActivityAt: string | null;
  slaState: TicketSlaState;
};

export async function enrichTicketInboxRows(
  companyId: string,
  tickets: TicketSummary[],
): Promise<TicketInboxRow[]> {
  if (tickets.length === 0) return [];

  const customerIds = [...new Set(tickets.map((t) => t.customerId).filter(Boolean))] as string[];
  const conversationIds = [
    ...new Set(tickets.map((t) => t.conversationId).filter(Boolean)),
  ] as string[];

  const [customersRes, conversationsRes] = await Promise.all([
    customerIds.length
      ? supabase
          .from("customers")
          .select("id, name, email, phone")
          .eq("company_id", companyId)
          .in("id", customerIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    conversationIds.length
      ? supabase
          .from("conversations")
          .select("id, channel_type, last_message_at, last_participant_type")
          .eq("company_id", companyId)
          .in("id", conversationIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
  ]);

  // Enrichment is best-effort; inbox still renders ticket core fields if joins fail.
  if (customersRes.error) {
    console.warn("[tickets] customer enrichment failed", customersRes.error.message);
  }
  if (conversationsRes.error) {
    console.warn("[tickets] conversation enrichment failed", conversationsRes.error.message);
  }

  const customerById = new Map<
    string,
    { name: string | null; phone: string | null; email: string | null }
  >();
  for (const row of customersRes.data ?? []) {
    const id = String(row.id);
    const name = String(row.name ?? "").trim() || null;
    const phone = String(row.phone ?? "").trim() || null;
    const email = String(row.email ?? "").trim() || null;
    customerById.set(id, {
      name: name || email,
      phone,
      email,
    });
  }

  const conversationById = new Map<
    string,
    { channelType: string | null; lastCustomerActivityAt: string | null }
  >();
  for (const row of conversationsRes.data ?? []) {
    const id = String(row.id);
    const lastParticipant = String(row.last_participant_type ?? "");
    conversationById.set(id, {
      channelType: row.channel_type ? String(row.channel_type) : null,
      lastCustomerActivityAt:
        lastParticipant === "customer" && row.last_message_at
          ? String(row.last_message_at)
          : row.last_message_at
            ? String(row.last_message_at)
            : null,
    });
  }

  return tickets.map((ticket) => {
    const conversation = ticket.conversationId
      ? conversationById.get(ticket.conversationId)
      : undefined;
    const customer = ticket.customerId ? customerById.get(ticket.customerId) : undefined;
    return {
      ...ticket,
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
      customerEmail: customer?.email ?? null,
      channelType: conversation?.channelType ?? null,
      lastCustomerActivityAt: conversation?.lastCustomerActivityAt ?? null,
      slaState: resolveTicketSlaState({
        slaDueAt: ticket.slaDueAt,
        status: ticket.status,
        resolvedAt: ticket.resolvedAt,
        closedAt: ticket.closedAt,
      }),
    };
  });
}
