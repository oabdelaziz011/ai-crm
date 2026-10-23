import { DEFAULT_OPPORTUNITY_STAGE_TRANSITIONS } from "../constants.js";
import { OpportunityValidationError } from "../errors.js";
import type { OpportunityStageKey } from "../types.js";

export function isOpportunityStageTransitionAllowed(
  from: OpportunityStageKey | string,
  to: OpportunityStageKey | string,
): boolean {
  if (from === to) return true;
  const allowed = DEFAULT_OPPORTUNITY_STAGE_TRANSITIONS[from as OpportunityStageKey];
  if (!allowed) return false;
  return allowed.includes(to as OpportunityStageKey);
}

export function assertOpportunityStageTransition(
  from: OpportunityStageKey | string,
  to: OpportunityStageKey | string,
): void {
  if (isOpportunityStageTransitionAllowed(from, to)) return;
  throw new OpportunityValidationError(
    `Opportunity stage transition not allowed: ${String(from)} → ${String(to)}`,
  );
}
