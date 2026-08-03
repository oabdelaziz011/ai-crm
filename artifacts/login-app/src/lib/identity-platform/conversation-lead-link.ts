import type { SupabaseClient } from "@supabase/supabase-js";

export async function linkLeadToConversation(
  client: SupabaseClient,
  input: {
    companyId: string;
    conversationId: string;
    leadId: string;
  },
): Promise<void> {
  const { error: conversationError } = await client
    .from("conversations")
    .update({
      lead_id: input.leadId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.conversationId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null);

  if (conversationError) throw new Error(conversationError.message);

  const { error: leadError } = await client
    .from("leads")
    .update({
      conversation_id: input.conversationId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.leadId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null);

  if (leadError) throw new Error(leadError.message);
}
