/**
 * Copy an already trusted conversation customer onto the lead.
 * Does not create a customer and does not read free-text identity from messages.
 * web_chat stays anonymous until a channel resolver or the customer service has a row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PreserveConversationCustomerResult =
  | "already_linked"
  | "linked"
  | "no_conversation_customer"
  | "customer_not_in_company";

export async function preserveTrustedConversationCustomer(
  client: SupabaseClient,
  input: {
    companyId: string;
    conversationId: string;
    leadId: string;
    updateLeadCustomer: (customerId: string) => Promise<void>;
  },
): Promise<PreserveConversationCustomerResult> {
  const { data: lead, error: leadError } = await client
    .from("leads")
    .select("id, customer_id")
    .eq("id", input.leadId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (leadError) throw new Error(leadError.message);
  if (!lead) return "no_conversation_customer";
  if (typeof lead.customer_id === "string" && lead.customer_id.trim()) {
    return "already_linked";
  }

  const { data: conversation, error: conversationError } = await client
    .from("conversations")
    .select("id, customer_id")
    .eq("id", input.conversationId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (conversationError) throw new Error(conversationError.message);
  const customerId =
    typeof conversation?.customer_id === "string" ? conversation.customer_id.trim() : "";
  if (!UUID_RE.test(customerId)) return "no_conversation_customer";

  const { data: customer, error: customerError } = await client
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);
  if (!customer) return "customer_not_in_company";

  await input.updateLeadCustomer(customerId);
  return "linked";
}
