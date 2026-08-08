import { OPPORTUNITY_PERMISSIONS } from "../constants.js";
import {
  OpportunityNotFoundError,
  OpportunityPermissionError,
  OpportunityValidationError,
} from "../errors.js";
import type { OpportunityRepository } from "../repositories/opportunity-repository-port.js";
import {
  computeWeightedRevenue,
  type OpportunityRecord,
  type OpportunityServiceContext,
} from "../types.js";

export type OpportunityEventPublisherPort = {
  publishCreated(input: {
    opportunityId: string;
    name: string;
    leadId?: string | null;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishStageChanged(input: {
    opportunityId: string;
    fromStageId: string;
    toStageId: string;
    stageKey: string;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishProbabilityChanged(input: {
    opportunityId: string;
    previousPercent: number;
    nextPercent: number;
    source: string;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishWon(input: {
    opportunityId: string;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishLost(input: {
    opportunityId: string;
    reason?: string | null;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishNegotiationStarted(input: {
    opportunityId: string;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
};

function assertActor(ctx: OpportunityServiceContext): string {
  if (!ctx.userId) throw new OpportunityValidationError("Authenticated actor required.");
  return ctx.userId;
}

function assertCompany(ctx: OpportunityServiceContext, companyId: string) {
  if (!ctx.isSuperAdmin && ctx.companyId !== companyId) {
    throw new OpportunityPermissionError("tenant");
  }
}

function assertPermission(ctx: OpportunityServiceContext, code: string) {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(code)) throw new OpportunityPermissionError(code);
}

function extractAiContext(metadata: Record<string, unknown>, aiSummary: string) {
  const intel = (metadata.aiIntelligence as Record<string, unknown> | undefined) ?? null;
  const country =
    intel && typeof intel === "object" && intel.country && typeof intel.country === "object"
      ? (intel.country as Record<string, unknown>)
      : null;
  const countryValue =
    country && typeof country.country === "object"
      ? ((country.country as { value?: unknown }).value as string | undefined) ?? null
      : null;
  const marketValue =
    country && typeof country.market === "object"
      ? ((country.market as { value?: unknown }).value as string | undefined) ?? null
      : null;

  const buyingSignals = Array.isArray(intel?.buyingSignals) ? intel.buyingSignals : [];
  const riskSignals = Array.isArray(intel?.riskSignals) ? intel.riskSignals : [];
  const recommendations = Array.isArray(intel?.recommendations) ? intel.recommendations : [];
  const score =
    intel && typeof intel.score === "object" && intel.score && "overall" in (intel.score as object)
      ? Number(
          ((intel.score as { overall?: { value?: unknown } }).overall?.value as number | undefined) ??
            NaN,
        )
      : null;

  return {
    summary: aiSummary || (typeof intel?.summary === "string" ? intel.summary : "") || "",
    country: countryValue,
    market: marketValue,
    buyingSignals,
    riskSignals,
    recommendations,
    aiScore: Number.isFinite(score) ? score : null,
    snapshotAt: new Date().toISOString(),
  };
}

export class OpportunityCommandService {
  constructor(
    private readonly deps: {
      opportunities: OpportunityRepository;
      events: OpportunityEventPublisherPort;
    },
  ) {}

  async createManual(
    ctx: OpportunityServiceContext,
    input: {
      companyId: string;
      name: string;
      companyName?: string;
      primaryContactName?: string;
      ownerUserId?: string;
      expectedRevenue?: number;
      currency?: string;
      expectedCloseDate?: string | null;
      stageId?: string;
      pipelineId?: string;
      country?: string;
      market?: string;
      language?: string;
      leadId?: string;
      customerId?: string;
    },
  ): Promise<{ opportunity: OpportunityRecord }> {
    const actorUserId = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, OPPORTUNITY_PERMISSIONS.create);

    const pipelineId =
      input.pipelineId ?? (await this.deps.opportunities.ensureDefaultPipeline(input.companyId));
    const defaultStage = await this.deps.opportunities.getDefaultStage(input.companyId, pipelineId);
    if (!defaultStage) throw new OpportunityValidationError("Default opportunity stage not found.");

    let stage = defaultStage;
    if (input.stageId) {
      const found = await this.deps.opportunities.getStage(input.companyId, input.stageId);
      if (!found) throw new OpportunityValidationError("Stage not found.");
      stage = found;
    }

    const probabilityPercent = stage.defaultProbabilityPercent;
    const expectedRevenue = input.expectedRevenue ?? null;
    const weightedRevenue = computeWeightedRevenue(expectedRevenue, probabilityPercent);

    const opportunity = await this.deps.opportunities.createOpportunity({
      companyId: input.companyId,
      pipelineId,
      stageId: stage.id,
      name: input.name.trim(),
      leadId: input.leadId ?? null,
      customerId: input.customerId ?? null,
      primaryContactName: input.primaryContactName ?? "",
      ownerUserId: input.ownerUserId ?? actorUserId,
      companyName: input.companyName ?? null,
      country: input.country ?? null,
      market: input.market ?? null,
      language: input.language ?? null,
      currency: input.currency ?? "USD",
      expectedRevenue,
      weightedRevenue,
      probabilityPercent,
      probabilityConfidence: null,
      probabilitySource: "manual",
      probabilityReason: `Default probability for ${stage.name}`,
      expectedCloseDate: input.expectedCloseDate ?? null,
      createdFromLead: Boolean(input.leadId),
      createdBy: actorUserId,
    });

    await this.deps.opportunities.addHistory({
      companyId: input.companyId,
      opportunityId: opportunity.id,
      eventType: "opportunity_created",
      summary: `Opportunity created: ${opportunity.name}`,
      actorUserId,
    });

    await this.deps.events.publishCreated({
      opportunityId: opportunity.id,
      name: opportunity.name,
      leadId: opportunity.leadId,
      companyId: input.companyId,
      actorUserId,
    });

    return { opportunity };
  }

  /**
   * Create from Lead — carries context snapshot; never duplicates conversations.
   * Requires opportunities.convert (and lead must be qualified unless already converted to customer).
   */
  async createFromLead(
    ctx: OpportunityServiceContext,
    input: { companyId: string; leadId: string; name?: string },
  ): Promise<{ opportunity: OpportunityRecord }> {
    const actorUserId = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, OPPORTUNITY_PERMISSIONS.convert);

    const lead = await this.deps.opportunities.getLeadSnapshot(input.companyId, input.leadId);
    if (!lead) throw new OpportunityValidationError("Source lead not found.");
    if (!lead.isQualified && !lead.customerId) {
      throw new OpportunityValidationError("Lead must be qualified before creating an opportunity.");
    }

    const existing = await this.deps.opportunities.listOpportunities({
      companyId: input.companyId,
      leadId: lead.id,
      limit: 1,
      offset: 0,
    });
    if (existing.total > 0) {
      throw new OpportunityValidationError("An opportunity already exists for this lead.");
    }

    const aiContext = extractAiContext(lead.metadata, lead.aiSummary);
    const pipelineId = await this.deps.opportunities.ensureDefaultPipeline(input.companyId);
    const stage = await this.deps.opportunities.getDefaultStage(input.companyId, pipelineId);
    if (!stage) throw new OpportunityValidationError("Default opportunity stage not found.");

    const probabilityPercent = stage.defaultProbabilityPercent;
    const expectedRevenue = lead.estimatedValue;
    const weightedRevenue = computeWeightedRevenue(expectedRevenue, probabilityPercent);
    const name =
      input.name?.trim() ||
      (lead.companyName ? `${lead.companyName} — ${lead.title}` : lead.title);

    const opportunity = await this.deps.opportunities.createOpportunity({
      companyId: input.companyId,
      pipelineId,
      stageId: stage.id,
      name,
      leadId: lead.id,
      customerId: lead.customerId,
      primaryContactName: lead.contactName,
      ownerUserId: lead.assignedUserId ?? actorUserId,
      companyName: lead.companyName,
      country: aiContext.country ?? lead.territory,
      market: aiContext.market,
      language: lead.language,
      currency: lead.currency,
      expectedRevenue,
      weightedRevenue,
      probabilityPercent,
      probabilityConfidence: null,
      probabilitySource: "manual",
      probabilityReason: `Seeded from stage ${stage.name} after lead qualification`,
      expectedCloseDate: lead.expectedCloseDate,
      createdFromLead: true,
      aiScoreSnapshot: aiContext.aiScore ?? lead.score,
      aiContextSnapshot: {
        leadSummary: aiContext.summary,
        buyingSignals: aiContext.buyingSignals,
        riskSignals: aiContext.riskSignals,
        recommendations: aiContext.recommendations,
        country: aiContext.country,
        market: aiContext.market,
        language: lead.language,
        snapshotAt: aiContext.snapshotAt,
        // Conversations intentionally omitted — remain on Lead / Omnichannel
      },
      metadata: {
        sourceLeadId: lead.id,
        createdFrom: "lead",
      },
      createdBy: actorUserId,
    });

    await this.deps.opportunities.addHistory({
      companyId: input.companyId,
      opportunityId: opportunity.id,
      eventType: "opportunity_created",
      summary: `Opportunity created from lead ${lead.title}`,
      payload: { leadId: lead.id },
      actorUserId,
    });

    await this.deps.events.publishCreated({
      opportunityId: opportunity.id,
      name: opportunity.name,
      leadId: lead.id,
      companyId: input.companyId,
      actorUserId,
    });

    return { opportunity };
  }

  async changeStage(
    ctx: OpportunityServiceContext,
    input: { companyId: string; opportunityId: string; stageId: string },
  ): Promise<{ opportunity: OpportunityRecord }> {
    const actorUserId = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, OPPORTUNITY_PERMISSIONS.edit);

    const existing = await this.deps.opportunities.getOpportunity(input.companyId, input.opportunityId);
    if (!existing) throw new OpportunityNotFoundError(input.opportunityId);

    const stage = await this.deps.opportunities.getStage(input.companyId, input.stageId);
    if (!stage) throw new OpportunityValidationError("Stage not found.");

    const nowIso = new Date().toISOString();
    const probabilityPercent = stage.defaultProbabilityPercent;
    const weightedRevenue = computeWeightedRevenue(existing.expectedRevenue, probabilityPercent);

    const opportunity = await this.deps.opportunities.updateOpportunity({
      companyId: input.companyId,
      opportunityId: input.opportunityId,
      updatedBy: actorUserId,
      stageId: stage.id,
      probabilityPercent,
      probabilitySource: "manual",
      probabilityReason: `Stage default: ${stage.name}`,
      weightedRevenue,
      wonAt: stage.stageKey === "won" ? nowIso : existing.wonAt,
      lostAt: stage.stageKey === "lost" ? nowIso : existing.lostAt,
    });

    await this.deps.opportunities.addHistory({
      companyId: input.companyId,
      opportunityId: opportunity.id,
      eventType: "stage_changed",
      fieldName: "stage_id",
      previousValue: existing.stageId,
      newValue: stage.id,
      summary: `Stage changed to ${stage.name}`,
      payload: { stageKey: stage.stageKey },
      actorUserId,
    });

    if (existing.probabilityPercent !== probabilityPercent) {
      await this.deps.opportunities.addHistory({
        companyId: input.companyId,
        opportunityId: opportunity.id,
        eventType: "probability_changed",
        fieldName: "probability_percent",
        previousValue: String(existing.probabilityPercent),
        newValue: String(probabilityPercent),
        summary: `Probability updated to ${probabilityPercent}%`,
        actorUserId,
      });
      await this.deps.events.publishProbabilityChanged({
        opportunityId: opportunity.id,
        previousPercent: existing.probabilityPercent,
        nextPercent: probabilityPercent,
        source: "manual",
        companyId: input.companyId,
        actorUserId,
      });
    }

    await this.deps.events.publishStageChanged({
      opportunityId: opportunity.id,
      fromStageId: existing.stageId,
      toStageId: stage.id,
      stageKey: stage.stageKey,
      companyId: input.companyId,
      actorUserId,
    });

    if (stage.stageKey === "negotiation") {
      await this.deps.opportunities.addHistory({
        companyId: input.companyId,
        opportunityId: opportunity.id,
        eventType: "negotiation_started",
        summary: "Negotiation started",
        actorUserId,
      });
      await this.deps.events.publishNegotiationStarted({
        opportunityId: opportunity.id,
        companyId: input.companyId,
        actorUserId,
      });
    }

    if (stage.stageKey === "won") {
      await this.deps.opportunities.addHistory({
        companyId: input.companyId,
        opportunityId: opportunity.id,
        eventType: "won",
        summary: "Opportunity won",
        actorUserId,
      });
      await this.deps.events.publishWon({
        opportunityId: opportunity.id,
        companyId: input.companyId,
        actorUserId,
      });
    }

    if (stage.stageKey === "lost") {
      await this.deps.opportunities.addHistory({
        companyId: input.companyId,
        opportunityId: opportunity.id,
        eventType: "lost",
        summary: "Opportunity lost",
        actorUserId,
      });
      await this.deps.events.publishLost({
        opportunityId: opportunity.id,
        companyId: input.companyId,
        actorUserId,
      });
    }

    return { opportunity };
  }

  async updateProbability(
    ctx: OpportunityServiceContext,
    input: {
      companyId: string;
      opportunityId: string;
      percent: number;
      confidence?: number | null;
      source?: string;
      reason?: string;
    },
  ): Promise<{ opportunity: OpportunityRecord }> {
    const actorUserId = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, OPPORTUNITY_PERMISSIONS.edit);

    if (input.percent < 0 || input.percent > 100) {
      throw new OpportunityValidationError("Probability must be between 0 and 100.");
    }

    const existing = await this.deps.opportunities.getOpportunity(input.companyId, input.opportunityId);
    if (!existing) throw new OpportunityNotFoundError(input.opportunityId);

    const weightedRevenue = computeWeightedRevenue(existing.expectedRevenue, input.percent);
    const opportunity = await this.deps.opportunities.updateOpportunity({
      companyId: input.companyId,
      opportunityId: input.opportunityId,
      updatedBy: actorUserId,
      probabilityPercent: input.percent,
      probabilityConfidence: input.confidence ?? null,
      probabilitySource: input.source ?? "manual",
      probabilityReason: input.reason ?? "",
      weightedRevenue,
    });

    await this.deps.opportunities.addHistory({
      companyId: input.companyId,
      opportunityId: opportunity.id,
      eventType: "probability_changed",
      fieldName: "probability_percent",
      previousValue: String(existing.probabilityPercent),
      newValue: String(input.percent),
      summary: `Probability set to ${input.percent}%`,
      actorUserId,
    });

    await this.deps.events.publishProbabilityChanged({
      opportunityId: opportunity.id,
      previousPercent: existing.probabilityPercent,
      nextPercent: input.percent,
      source: input.source ?? "manual",
      companyId: input.companyId,
      actorUserId,
    });

    return { opportunity };
  }

  async updateFields(
    ctx: OpportunityServiceContext,
    input: {
      companyId: string;
      opportunityId: string;
      name?: string;
      expectedRevenue?: number | null;
      currency?: string;
      expectedCloseDate?: string | null;
      ownerUserId?: string | null;
      companyName?: string | null;
      primaryContactName?: string;
      country?: string | null;
      market?: string | null;
    },
  ): Promise<{ opportunity: OpportunityRecord }> {
    const actorUserId = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, OPPORTUNITY_PERMISSIONS.edit);

    const existing = await this.deps.opportunities.getOpportunity(input.companyId, input.opportunityId);
    if (!existing) throw new OpportunityNotFoundError(input.opportunityId);

    const expectedRevenue =
      input.expectedRevenue !== undefined ? input.expectedRevenue : existing.expectedRevenue;
    const weightedRevenue = computeWeightedRevenue(expectedRevenue, existing.probabilityPercent);

    const opportunity = await this.deps.opportunities.updateOpportunity({
      companyId: input.companyId,
      opportunityId: input.opportunityId,
      updatedBy: actorUserId,
      name: input.name,
      expectedRevenue,
      weightedRevenue,
      currency: input.currency,
      expectedCloseDate: input.expectedCloseDate,
      ownerUserId: input.ownerUserId,
      companyName: input.companyName,
      primaryContactName: input.primaryContactName,
      country: input.country,
      market: input.market,
    });

    return { opportunity };
  }

  async archive(
    ctx: OpportunityServiceContext,
    input: { companyId: string; opportunityId: string },
  ): Promise<void> {
    const actorUserId = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, OPPORTUNITY_PERMISSIONS.delete);
    await this.deps.opportunities.softDeleteOpportunity(input.companyId, input.opportunityId, actorUserId);
  }
}
