/**
 * Narrow CRM sync after a *confirmed* quote send (provider accepted).
 * Best-effort only — never fails the send path, never dispatches messages.
 *
 * Advances:
 * - Opportunity → stage_key = proposal (when opportunityId present and transition allowed)
 * - Lead → lifecycle proposal_sent (when leadId present and transition allowed)
 *
 * Skips draft / approval-pending / failed / ambiguous cases (caller must only invoke
 * after QuoteSendService returns status === "sent").
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createLeadPlatformServices,
  isStageTransitionAllowed,
  LEAD_PERMISSIONS,
  type LeadLifecycleStatus,
} from "@workspace/lead-platform";
import {
  createSupabaseOpportunityRepository,
  createSupabaseOpportunitySaleCompletion,
  OpportunityCommandService,
  OPPORTUNITY_PERMISSIONS,
  type OpportunityEventPublisherPort,
} from "@workspace/opportunity-platform";
import { logger } from "../../lib/logger.js";

const noopOppEvents: OpportunityEventPublisherPort = {
  async publishCreated() {},
  async publishStageChanged() {},
  async publishProbabilityChanged() {},
  async publishWon() {},
  async publishLost() {},
  async publishNegotiationStarted() {},
};

const LEAD_PERMS = new Set<string>([
  LEAD_PERMISSIONS.view,
  LEAD_PERMISSIONS.edit,
  LEAD_PERMISSIONS.qualify,
  LEAD_PERMISSIONS.manage,
]);

export type QuoteSendCrmSyncInput = {
  companyId: string;
  quoteId: string;
  actorUserId: string | null;
  /** Optional pre-resolved IDs; when omitted, loaded from the quote row. */
  opportunityId?: string | null;
  leadId?: string | null;
};

export async function syncCrmAfterConfirmedQuoteSend(
  client: SupabaseClient,
  input: QuoteSendCrmSyncInput,
): Promise<{ opportunityAdvanced: boolean; leadAdvanced: boolean }> {
  let opportunityAdvanced = false;
  let leadAdvanced = false;

  const actorUserId = input.actorUserId?.trim() || null;
  if (!actorUserId) {
    return { opportunityAdvanced, leadAdvanced };
  }

  let opportunityId = input.opportunityId ?? null;
  let leadId = input.leadId ?? null;
  if (!opportunityId || !leadId) {
    const { data: quoteRow } = await client
      .from("quotes")
      .select("id, opportunity_id")
      .eq("company_id", input.companyId)
      .eq("id", input.quoteId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!opportunityId && quoteRow?.opportunity_id) {
      opportunityId = String(quoteRow.opportunity_id);
    }
    if (!leadId && opportunityId) {
      const { data: oppRow } = await client
        .from("opportunities")
        .select("lead_id")
        .eq("company_id", input.companyId)
        .eq("id", opportunityId)
        .is("deleted_at", null)
        .maybeSingle();
      if (oppRow?.lead_id) leadId = String(oppRow.lead_id);
    }
  }

  if (opportunityId) {
    try {
      const repos = createSupabaseOpportunityRepository(client);
      // Use resolved opportunityId (may be loaded from the quote row when input omits it).
      const opp = await repos.getOpportunity(input.companyId, opportunityId);
      if (opp && !opp.wonAt && !opp.lostAt) {
        const stages = await repos.listStages(input.companyId, opp.pipelineId);
        const current = stages.find((s) => s.id === opp.stageId);
        const proposal = stages.find((s) => s.stageKey === "proposal");
        if (current && proposal && current.id !== proposal.id) {
          const commands = new OpportunityCommandService({
            opportunities: repos,
            events: noopOppEvents,
            saleCompletion: createSupabaseOpportunitySaleCompletion(client),
          });
          await commands.changeStage(
            {
              userId: actorUserId,
              companyId: input.companyId,
              isSuperAdmin: true,
              hasPermission: (code) => code === OPPORTUNITY_PERMISSIONS.edit,
            },
            {
              companyId: input.companyId,
              opportunityId: opp.id,
              stageId: proposal.id,
            },
          );
          opportunityAdvanced = true;
        }
      }
    } catch (error) {
      logger.warn(
        {
          event: "quote.send.crm_sync.opportunity_failed",
          companyId: input.companyId,
          opportunityId,
          message: error instanceof Error ? error.message : String(error),
        },
        "CRM opportunity proposal sync skipped",
      );
    }
  }

  if (leadId) {
    try {
      const platform = createLeadPlatformServices(client);
      const ctx = {
        userId: actorUserId,
        companyId: input.companyId,
        isSuperAdmin: true,
        hasPermission: (code: string) => LEAD_PERMS.has(code),
      };
      const { lead } = await platform.queries.getLead(ctx, {
        companyId: input.companyId,
        leadId,
      });
      if (lead && isStageTransitionAllowed(lead.lifecycleStatus, "proposal_sent")) {
        const { stages } = await platform.queries.listStages(ctx, {
          companyId: input.companyId,
          pipelineId: lead.pipelineId,
        });
        const target = stages.find((s) => s.lifecycleStatus === ("proposal_sent" as LeadLifecycleStatus));
        if (target) {
          await platform.commands.changeLeadStage(ctx, {
            companyId: input.companyId,
            leadId: lead.id,
            stageId: target.id,
            stageAudit: { source: "system", reason: "confirmed_quote_send" },
          });
          leadAdvanced = true;
        }
      }
    } catch (error) {
      logger.warn(
        {
          event: "quote.send.crm_sync.lead_failed",
          companyId: input.companyId,
          leadId,
          message: error instanceof Error ? error.message : String(error),
        },
        "CRM lead proposal_sent sync skipped",
      );
    }
  }

  return { opportunityAdvanced, leadAdvanced };
}
