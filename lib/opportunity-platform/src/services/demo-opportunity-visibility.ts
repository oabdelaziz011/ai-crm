/**
 * Demo-led Opportunity visibility for the Opportunities module.
 *
 * Authoritative rule:
 * - An Opportunity is visible only when its Lead has reached the Kanban column فرصة
 *   (persisted lifecycle_status `demo_completed`) or a later lifecycle.
 * - Earlier statuses (new, contacted, qualified, demo_scheduled, nurturing, …)
 *   stay out of Opportunities lists, boards, and detail.
 * - Opportunities without a lead stay hidden. Moving the lead into فرصة is the only entry.
 *
 * Persisted key remains `demo_completed`. Display labels are i18n only.
 * Does not create Opportunities.
 */

const DEMO_SCHEDULED = "demo_scheduled";

/** Lifecycles that have reached the Kanban فرصة column or moved past it. */
export const OPPORTUNITY_VISIBLE_LEAD_LIFECYCLES = [
  "demo_completed",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
  "converted",
  "closed",
] as const;

const VISIBLE = new Set<string>(OPPORTUNITY_VISIBLE_LEAD_LIFECYCLES);

export function normalizeLifecycleStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase();
}

/**
 * @returns true when the Opportunity should appear in Opportunities module lists.
 */
export function isOpportunityVisibleInModule(input: {
  leadId: string | null | undefined;
  leadLifecycleStatus: string | null | undefined;
}): boolean {
  if (!input.leadId) return false;
  return VISIBLE.has(normalizeLifecycleStatus(input.leadLifecycleStatus));
}

export function isDemoScheduledLifecycle(status: string | null | undefined): boolean {
  return normalizeLifecycleStatus(status) === DEMO_SCHEDULED;
}
