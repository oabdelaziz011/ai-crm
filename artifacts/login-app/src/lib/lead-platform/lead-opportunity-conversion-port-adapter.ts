import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadOpportunityConversionPort } from "@workspace/lead-platform";
import {
  createSupabaseOpportunityRepository,
  OPPORTUNITY_PERMISSIONS,
  OpportunityPermissionError,
  OpportunityValidationError,
  resolveLeadOpportunityCurrency,
} from "@workspace/opportunity-platform";
import { getCompanyCurrency } from "@/lib/company-locale/runtime";
import { createLoginAppOpportunityPlatformServices } from "@/lib/opportunity-platform/opportunity-platform-factory";

/**
 * Opportunity step of "Convert Lead → Customer + Opportunity".
 * Delegates creation to OpportunityCommandService.createFromLead so pipeline, stage,
 * owner, amount, close date and currency defaults stay owned by the Opportunity platform.
 */
export function createLoginAppLeadOpportunityConversionPort(
  client: SupabaseClient,
  options: { companyCurrency?: () => string | undefined } = {},
): LeadOpportunityConversionPort {
  const repository = createSupabaseOpportunityRepository(client);
  const companyCurrency = options.companyCurrency ?? (() => getCompanyCurrency());

  const resolveDefaultCurrency = (explicit?: string) => explicit?.trim() || companyCurrency() || undefined;

  const findExisting = async (companyId: string, leadId: string) => {
    // Only open opportunities (won/lost/soft-deleted excluded). Closed deals must not block
    // a new Opportunity for the same lead after Won/Lost.
    const existing = await repository.listOpportunities({
      companyId,
      leadId,
      openOnly: true,
      limit: 5,
      offset: 0,
    });
    return existing.items.find((item) => !item.wonAt && !item.lostAt) ?? null;
  };

  return {
    async findOpportunityForLead(input) {
      const found = await findExisting(input.companyId, input.leadId);
      return found ? { opportunityId: found.id } : null;
    },

    async assertCanCreateForLead(ctx, input) {
      if (!ctx.isSuperAdmin && !ctx.hasPermission(OPPORTUNITY_PERMISSIONS.convert)) {
        throw new OpportunityPermissionError(OPPORTUNITY_PERMISSIONS.convert);
      }
      if (await findExisting(input.companyId, input.leadId)) return;
      const lead = await repository.getLeadSnapshot(input.companyId, input.leadId);
      if (!lead) throw new OpportunityValidationError("Source lead not found.");
      // Same currency rule createFromLead applies — throws the same actionable error up front.
      resolveLeadOpportunityCurrency(lead.currency, resolveDefaultCurrency(input.companyDefaultCurrency));
    },

    async ensureOpportunityForLead(ctx, input) {
      const existing = await findExisting(input.companyId, input.leadId);
      if (existing) return { opportunityId: existing.id, created: false };
      const platform = createLoginAppOpportunityPlatformServices(client);
      const { opportunity } = await platform.commands.createFromLead(ctx, {
        companyId: input.companyId,
        leadId: input.leadId,
        companyDefaultCurrency: resolveDefaultCurrency(input.companyDefaultCurrency),
      });
      return { opportunityId: opportunity.id, created: true };
    },
  };
}
