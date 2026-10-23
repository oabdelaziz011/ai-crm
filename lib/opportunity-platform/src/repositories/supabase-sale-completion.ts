import type { SupabaseClient } from "@supabase/supabase-js";

/** Accepted quote on this opportunity and company. Sent or draft quotes do not count. */
export function createSupabaseOpportunitySaleCompletion(client: SupabaseClient): {
  hasAcceptedQuoteForOpportunity(input: { companyId: string; opportunityId: string }): Promise<boolean>;
} {
  return {
    async hasAcceptedQuoteForOpportunity(input) {
      const { data, error } = await client
        .from("quotes")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("opportunity_id", input.opportunityId)
        .eq("status", "accepted")
        .not("accepted_at", "is", null)
        .is("deleted_at", null)
        .limit(1);
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
  };
}
