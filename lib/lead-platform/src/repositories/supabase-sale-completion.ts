import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sale completion is an accepted quote (status accepted and accepted_at set)
 * on an opportunity that belongs to this lead and company.
 * Draft, sent, and approval-pending quotes are not completion.
 */
export function createSupabaseLeadSaleCompletion(client: SupabaseClient): {
  hasAcceptedQuoteForLead(input: { companyId: string; leadId: string }): Promise<boolean>;
} {
  return {
    async hasAcceptedQuoteForLead(input) {
      const { data: opportunities, error } = await client
        .from("opportunities")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("lead_id", input.leadId)
        .limit(20);
      if (error) throw new Error(error.message);
      const ids = (opportunities ?? []).map((row) => String(row.id)).filter(Boolean);
      if (ids.length === 0) return false;
      const { data, error: quoteError } = await client
        .from("quotes")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("status", "accepted")
        .not("accepted_at", "is", null)
        .is("deleted_at", null)
        .in("opportunity_id", ids)
        .limit(1);
      if (quoteError) throw new Error(quoteError.message);
      return (data ?? []).length > 0;
    },
  };
}
