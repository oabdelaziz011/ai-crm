import type { OpportunityListFilter, OpportunityListOutcomeFilter } from "@workspace/application-layer";

export type OpportunitiesTableUiFilters = {
  query: string;
  stageId: string;
  /** Lead kanban lifecycle. Empty means every status that already appears in Opportunities. */
  leadLifecycleStatus?: string;
  ownerUserId: string;
  /** empty = all outcomes */
  outcome: "" | OpportunityListOutcomeFilter;
  limit: number;
  offset: number;
  pipelineId?: string;
};

/** Maps toolbar state to the authoritative Opportunity list filter (no invented fields). */
export function buildOpportunityListFilter(
  ui: OpportunitiesTableUiFilters,
): OpportunityListFilter {
  const filter: {
    pipelineId?: string;
    stageId?: string;
    ownerUserId?: string;
    query?: string;
    leadLifecycleStatus?: string;
    outcome?: OpportunityListOutcomeFilter;
    limit: number;
    offset: number;
  } = {
    limit: ui.limit,
    offset: ui.offset,
  };

  const pipelineId = ui.pipelineId?.trim();
  if (pipelineId) filter.pipelineId = pipelineId;

  const stageId = ui.stageId.trim();
  if (stageId) filter.stageId = stageId;

  const leadLifecycleStatus = ui.leadLifecycleStatus?.trim();
  if (leadLifecycleStatus) filter.leadLifecycleStatus = leadLifecycleStatus;

  const ownerUserId = ui.ownerUserId.trim();
  if (ownerUserId) filter.ownerUserId = ownerUserId;

  const query = ui.query.trim();
  if (query) filter.query = query;

  if (ui.outcome === "open" || ui.outcome === "won" || ui.outcome === "lost") {
    filter.outcome = ui.outcome;
  }

  return Object.freeze(filter);
}

export function opportunityCustomerLabel(input: {
  companyName?: string | null;
  primaryContact?: string | null;
  missingLabel: string;
}): string {
  const company = input.companyName?.trim();
  if (company) return company;
  const contact = input.primaryContact?.trim();
  if (contact) return contact;
  return input.missingLabel;
}

export function opportunityProductLabel(input: {
  primaryProductName?: string | null;
  primaryProductId?: string | null;
  missingLabel: string;
}): string {
  const name = input.primaryProductName?.trim();
  if (name) return name;
  // Never invent a product name from a bare id.
  if (input.primaryProductId?.trim()) return input.missingLabel;
  return input.missingLabel;
}
