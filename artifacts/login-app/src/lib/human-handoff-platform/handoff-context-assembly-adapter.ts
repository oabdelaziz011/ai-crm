import type { SupabaseClient } from "@supabase/supabase-js";
import type { HandoffAgentResolverPort, HandoffContextAssemblyPort } from "@workspace/human-handoff-platform";
import { getLoginAppTicketReadPort } from "@/lib/ticket-platform/ticket-read-port-adapter";
import { TICKET_PERMISSIONS } from "@workspace/ticket-platform";

export function createLoginAppHandoffAgentResolverPort(
  client: SupabaseClient,
): HandoffAgentResolverPort {
  return {
    async resolveAgentLabel(userId) {
      const { data } = await client
        .from("profiles")
        .select("full_name, email")
        .eq("id", userId)
        .maybeSingle();
      if (!data) return userId;
      const name = data.full_name?.trim() || data.email?.trim();
      return name || userId;
    },

    async loadAgentLabels(userIds) {
      if (!userIds.length) return new Map();
      const { data } = await client.from("profiles").select("id, full_name, email").in("id", userIds);
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        map.set(String(row.id), row.full_name?.trim() || row.email?.trim() || String(row.id));
      }
      return map;
    },
  };
}

export function createLoginAppHandoffContextAssemblyPort(
  client: SupabaseClient,
): HandoffContextAssemblyPort {
  return {
    async buildContext(input) {
      const { data: conversation } = await client
        .from("conversations")
        .select("id, customer_id, metadata, ai_assistant_id, channel_type, priority")
        .eq("company_id", input.companyId)
        .eq("id", input.conversationId)
        .maybeSingle();

      const { data: messages } = await client
        .from("conversation_messages")
        .select("id, body, sender_type, created_at")
        .eq("conversation_id", input.conversationId)
        .order("created_at", { ascending: false })
        .limit(25);

      let customerProfile: Record<string, unknown> | undefined;
      if (conversation?.customer_id) {
        const { data: customer } = await client
          .from("customers")
          .select("id, name, email, phone")
          .eq("id", conversation.customer_id)
          .maybeSingle();
        if (customer) {
          customerProfile = {
            id: customer.id,
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
          };
        }
      }

      const ticketReads = getLoginAppTicketReadPort(client);
      let openTickets: unknown[] = [];
      if (conversation?.customer_id) {
        const snapshot = await ticketReads.fetchCustomerSnapshot(
          {
            userId: null,
            companyId: input.companyId,
            isSuperAdmin: false,
            hasPermission: (code) => code === TICKET_PERMISSIONS.view,
          },
          { companyId: input.companyId, customerId: conversation.customer_id },
        );
        openTickets = [...snapshot.openTickets, ...snapshot.recentClosedTickets].slice(0, 10);
      }

      let appointments: unknown[] = [];
      if (conversation?.customer_id) {
        const { data: bookings } = await client
          .from("scheduling_bookings")
          .select("id, status, start_at, end_at")
          .eq("company_id", input.companyId)
          .eq("customer_id", conversation.customer_id)
          .is("deleted_at", null)
          .gte("start_at", new Date().toISOString())
          .order("start_at", { ascending: true })
          .limit(5);
        appointments = bookings ?? [];
      }

      const history = (messages ?? []).reverse();
      const summary =
        history.length > 0
          ? `Conversation with ${history.length} recent messages on ${conversation?.channel_type ?? "channel"}.`
          : "No recent messages.";

      return {
        summary,
        suggestedResolution: input.reasonForEscalation
          ? `Review escalation reason: ${input.reasonForEscalation}`
          : "",
        suggestedReply: "",
        payload: {
          conversationHistory: history,
          customerProfile,
          reasonForEscalation: input.reasonForEscalation,
          openTickets,
          appointments,
          runtimeMetadata: input.runtimeMetadata,
          workflowState: (conversation?.metadata as Record<string, unknown>)?.lifecycle ?? {},
        },
        openTickets,
        appointments,
      };
    },
  };
}
