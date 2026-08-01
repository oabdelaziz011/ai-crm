import { supabase } from "@/lib/supabase";

export async function linkCustomerToConversation(input: {
  conversationId: string;
  customerId: string;
  companyId: string;
}): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({
      customer_id: input.customerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.conversationId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);
}
