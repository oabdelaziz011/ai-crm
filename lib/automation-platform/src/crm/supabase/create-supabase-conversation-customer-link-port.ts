import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationCustomerLinkPort } from "../../ports/conversation-customer-link-port.js";

export function createSupabaseConversationCustomerLinkPort(
  client: SupabaseClient,
): ConversationCustomerLinkPort {
  return {
    async linkCustomerToConversation(input) {
      const now = new Date().toISOString();
      const { error: conversationError } = await client
        .from("conversations")
        .update({
          customer_id: input.customerId,
          updated_at: now,
        })
        .eq("id", input.conversationId)
        .eq("company_id", input.companyId)
        .is("deleted_at", null);

      if (conversationError) throw conversationError;

      if (input.automationSessionId) {
        const { error: sessionError } = await client
          .from("conversation_sessions")
          .update({ customer_id: input.customerId })
          .eq("id", input.automationSessionId)
          .eq("company_id", input.companyId);

        if (sessionError) throw sessionError;
      }
    },
  };
}
