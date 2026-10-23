/**
 * Explicit Lead lifecycle → Opportunity stage_key mapping.
 *
 * These are separate lifecycle domains. Strings are never copied blindly.
 * Unmapped lead statuses leave the Opportunity unchanged.
 *
 * Lost is intentionally unmapped: Opportunity Lost requires a human lostReason.
 * Terminal Opportunity won/lost are never overwritten by this sync.
 *
 * Sync never sends quotes, email, WhatsApp, or other external messages —
 * it only calls OpportunityCommandService.changeStage (in-process).
 */

import { OPPORTUNITY_STAGE_KEYS } from "../constants.js";
import { OpportunityValidationError } from "../errors.js";
import type { OpportunityRepository } from "../repositories/opportunity-repository-port.js";
import type { OpportunityRecord, OpportunityServiceContext } from "../types.js";
import { isOpportunityStageTransitionAllowed } from "../validators/opportunity-stage-transition.js";
import {
  OpportunityCommandService,
  type OpportunityEventPublisherPort,
} from "./opportunity-command-service.js";

export type LeadLifecycleToOpportunityStageKey = (typeof OPPORTUNITY_STAGE_KEYS)[number];

/**
 * Documented mapping. Keys are leads.lifecycle_status values.
 * Values are opportunities stage_key values (not display names).
 */
export const LEAD_LIFECYCLE_TO_OPPORTUNITY_STAGE_KEY: Readonly<
  Record<string, LeadLifecycleToOpportunityStageKey | null>
> = Object.freeze({
  new: null,
  qualified: "qualification",
  contacted: "discovery",
  demo_scheduled: "discovery",
  demo_completed: "discovery",
  proposal_sent: "proposal",
  negotiation: "negotiation",
  won: "won",
  // Lost requires Opportunity lostReason — do not invent one from Lead Kanban moves.
  lost: null,
  converted: null,
  archived: null,
});

export type LeadOpportunityStageSyncResult = {
  status:
    | "synced"
    | "skipped_no_opportunity"
    | "skipped_unmapped"
    | "skipped_terminal"
    | "skipped_same_stage"
    | "skipped_transition_not_allowed"
    | "skipped_no_target_stage"
    | "failed";
  reason: string;
  opportunityId?: string | null;
  fromStageKey?: string | null;
  toStageKey?: string | null;
};

export function mapLeadLifecycleToOpportunityStageKey(
  lifecycleStatus: string | null | undefined,
): LeadLifecycleToOpportunityStageKey | null {
  const key = String(lifecycleStatus ?? "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  if (!(key in LEAD_LIFECYCLE_TO_OPPORTUNITY_STAGE_KEY)) return null;
  return LEAD_LIFECYCLE_TO_OPPORTUNITY_STAGE_KEY[key] ?? null;
}

const noopEvents: OpportunityEventPublisherPort = {
  async publishCreated() {},
  async publishStageChanged() {},
  async publishProbabilityChanged() {},
  async publishWon() {},
  async publishLost() {},
  async publishNegotiationStarted() {},
};

function isTerminalOpportunity(opp: OpportunityRecord): boolean {
  return opp.wonAt != null || opp.lostAt != null;
}

/**
 * Synchronize the open Opportunity linked to a Lead after an authoritative Lead stage change.
 * Does not create Opportunities. Does not reopen Won/Lost. Does not invent Lost reasons.
 */
export async function syncOpportunityStageFromLeadLifecycle(
  deps: {
    opportunities: OpportunityRepository;
    events?: OpportunityEventPublisherPort;
    saleCompletion?: {
      hasAcceptedQuoteForOpportunity(input: { companyId: string; opportunityId: string }): Promise<boolean>;
    } | null;
  },
  ctx: OpportunityServiceContext,
  input: {
    companyId: string;
    leadId: string;
    toLifecycleStatus: string;
  },
): Promise<LeadOpportunityStageSyncResult> {
  const targetKey = mapLeadLifecycleToOpportunityStageKey(input.toLifecycleStatus);
  if (!targetKey) {
    return {
      status: "skipped_unmapped",
      reason: `Lead lifecycle "${input.toLifecycleStatus}" has no Opportunity stage mapping.`,
    };
  }

  const listed = await deps.opportunities.listOpportunities({
    companyId: input.companyId,
    leadId: input.leadId,
    openOnly: true,
    limit: 5,
    offset: 0,
    applyDemoVisibilityGate: false,
  });
  const opportunity = listed.items.find((item) => !isTerminalOpportunity(item)) ?? null;
  if (!opportunity) {
    // Also check for terminal rows so we can report clearly.
    const any = await deps.opportunities.listOpportunities({
      companyId: input.companyId,
      leadId: input.leadId,
      limit: 5,
      offset: 0,
      applyDemoVisibilityGate: false,
    });
    const terminal = any.items.find(isTerminalOpportunity);
    if (terminal) {
      return {
        status: "skipped_terminal",
        reason: "Linked Opportunity is Won/Lost; refusing to reopen or overwrite.",
        opportunityId: terminal.id,
        fromStageKey: null,
      };
    }
    return {
      status: "skipped_no_opportunity",
      reason: "No open Opportunity linked to this Lead.",
    };
  }

  if (isTerminalOpportunity(opportunity)) {
    return {
      status: "skipped_terminal",
      reason: "Linked Opportunity is Won/Lost; refusing to reopen or overwrite.",
      opportunityId: opportunity.id,
    };
  }

  const fromStage = await deps.opportunities.getStage(input.companyId, opportunity.stageId);
  if (!fromStage) {
    return {
      status: "failed",
      reason: "Current Opportunity stage row not found.",
      opportunityId: opportunity.id,
    };
  }

  if (fromStage.stageKey === "won" || fromStage.stageKey === "lost") {
    return {
      status: "skipped_terminal",
      reason: "Linked Opportunity stage_key is terminal; refusing to overwrite.",
      opportunityId: opportunity.id,
      fromStageKey: fromStage.stageKey,
    };
  }

  if (fromStage.stageKey === targetKey) {
    return {
      status: "skipped_same_stage",
      reason: `Opportunity already at stage_key "${targetKey}".`,
      opportunityId: opportunity.id,
      fromStageKey: fromStage.stageKey,
      toStageKey: targetKey,
    };
  }

  if (!isOpportunityStageTransitionAllowed(fromStage.stageKey, targetKey)) {
    return {
      status: "skipped_transition_not_allowed",
      reason: `Opportunity transition not allowed: ${fromStage.stageKey} → ${targetKey}.`,
      opportunityId: opportunity.id,
      fromStageKey: fromStage.stageKey,
      toStageKey: targetKey,
    };
  }

  const stages = await deps.opportunities.listStages(input.companyId, opportunity.pipelineId);
  const targetStage = stages.find((s) => s.stageKey === targetKey);
  if (!targetStage) {
    return {
      status: "skipped_no_target_stage",
      reason: `No Opportunity stage row with stage_key "${targetKey}" in pipeline.`,
      opportunityId: opportunity.id,
      fromStageKey: fromStage.stageKey,
      toStageKey: targetKey,
    };
  }

  // Lost is unmapped above; defensive guard if mapping ever changes.
  if (targetKey === "lost") {
    return {
      status: "skipped_unmapped",
      reason: "Opportunity Lost requires an explicit lostReason; Lead Kanban sync will not invent one.",
      opportunityId: opportunity.id,
      fromStageKey: fromStage.stageKey,
      toStageKey: targetKey,
    };
  }

  const commands = new OpportunityCommandService({
    opportunities: deps.opportunities,
    events: deps.events ?? noopEvents,
    saleCompletion: deps.saleCompletion,
  });

  try {
    await commands.changeStage(ctx, {
      companyId: input.companyId,
      opportunityId: opportunity.id,
      stageId: targetStage.id,
    });
    return {
      status: "synced",
      reason: `Opportunity stage synchronized to "${targetKey}".`,
      opportunityId: opportunity.id,
      fromStageKey: fromStage.stageKey,
      toStageKey: targetKey,
    };
  } catch (error) {
    const message =
      error instanceof OpportunityValidationError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Opportunity stage sync failed.";
    return {
      status: "failed",
      reason: message,
      opportunityId: opportunity.id,
      fromStageKey: fromStage.stageKey,
      toStageKey: targetKey,
    };
  }
}
