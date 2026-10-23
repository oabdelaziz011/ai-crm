import {
  resolveLeadOpportunityCurrency,
  resolveManualOpportunityCurrency,
} from "../currency-utils.js";
import { resolveDefaultOpportunityNameFromLead } from "../opportunity-name-utils.js";
import { OPPORTUNITY_PERMISSIONS } from "../constants.js";
import {
  OpportunityNotFoundError,
  OpportunityPermissionError,
  OpportunityValidationError,
} from "../errors.js";
import type { LeadCustomerEmailMatch, OpportunityRepository } from "../repositories/opportunity-repository-port.js";
import {
  computeWeightedRevenue,
  type OpportunityRecord,
  type OpportunityServiceContext,
} from "../types.js";
import { assertOpportunityStageTransition } from "../validators/opportunity-stage-transition.js";

function isOpenOpportunity(opp: OpportunityRecord): boolean {
  return opp.wonAt == null && opp.lostAt == null;
}

function isUniqueViolationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code === "23505") return true;
  return /duplicate key|unique constraint|opportunities_one_open_per_customer_product|opportunities_one_open_product_interest/i.test(
    String(e.message ?? ""),
  );
}

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

/**
 * Resolve customer identity for a lead-originated opportunity.
 * Authoritative sources only: lead.customer_id (tenant-verified) or an unambiguous
 * active email match in the same company. Never invents a customer.
 */
async function resolveCustomerIdForLead(
  opportunities: OpportunityRepository,
  input: { companyId: string; leadId: string; customerId: string | null; email: string | null },
): Promise<string | null> {
  if (input.customerId) {
    const inCompany = await opportunities.getCustomerInCompany(input.companyId, input.customerId);
    if (!inCompany) {
      throw new OpportunityValidationError(
        "Lead customer_id must reference a customer in this company.",
        "customer_not_in_company",
      );
    }
    return input.customerId;
  }
  if (!input.email?.trim()) return null;

  const match: LeadCustomerEmailMatch = await opportunities.findCustomerByEmail(
    input.companyId,
    input.email,
  );
  if (match.kind === "none") return null;
  if (match.kind === "duplicate") {
    throw new OpportunityValidationError(
      "Multiple customers share this email. Resolve the duplicate before creating an opportunity.",
      "customer_email_ambiguous",
    );
  }

  await opportunities.attachLeadToCustomer(input.companyId, input.leadId, match.customerId);
  return match.customerId;
}

function identityScopeMetadata(input: {
  customerId: string | null;
  primaryProductId: string | null;
  mode: "manual" | "from_lead";
}): Record<string, unknown> {
  if (input.customerId && input.primaryProductId) {
    return { identityScope: "customer_product" };
  }
  if (input.customerId && !input.primaryProductId) {
    return { identityScope: "general_deal" };
  }
  // Manual creates may intentionally omit both; lead-originated paths reject this.
  return { identityScope: input.mode === "manual" ? "unscoped_manual" : "unscoped" };
}

export class OpportunityCommandService {
  constructor(
    private readonly deps: {
      opportunities: OpportunityRepository;
      events: OpportunityEventPublisherPort;
      /** Accepted quote linked to this opportunity. Required before Won. */
      saleCompletion?: {
        hasAcceptedQuoteForOpportunity(input: { companyId: string; opportunityId: string }): Promise<boolean>;
      } | null;
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
      /** Company billing default (e.g. from CompanyLocale runtime). */
      companyDefaultCurrency?: string;
      expectedCloseDate?: string | null;
      stageId?: string;
      pipelineId?: string;
      country?: string;
      market?: string;
      language?: string;
      leadId?: string;
      customerId?: string;
      /** Canonical catalog product for commercial uniqueness with customer. */
      primaryProductId?: string;
      probabilityPercent?: number;
      probabilitySource?: string;
      probabilityReason?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{ opportunity: OpportunityRecord }> {
    const actorUserId = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, OPPORTUNITY_PERMISSIONS.create);

    const primaryProductId = input.primaryProductId?.trim() || null;
    const customerId = input.customerId?.trim() || null;
    if (customerId) {
      const customer = await this.deps.opportunities.getCustomerInCompany(
        input.companyId,
        customerId,
      );
      if (!customer) {
        throw new OpportunityValidationError(
          "customerId must reference a customer in this company.",
          "customer_not_in_company",
        );
      }
    }
    if (primaryProductId) {
      const product = await this.deps.opportunities.getCatalogProductInCompany(
        input.companyId,
        primaryProductId,
      );
      if (!product) {
        throw new OpportunityValidationError(
          "primaryProductId must reference an active catalog product in this company.",
          "product_not_in_company",
        );
      }
      // Product-scoped uniqueness requires a customer; half-scoped rows are a bug, not a deal type.
      if (!customerId) {
        throw new OpportunityValidationError(
          "primaryProductId requires a resolved customerId so open-opportunity uniqueness can apply.",
          "product_requires_customer",
        );
      }
    }
    if (customerId && primaryProductId) {
      const existingScope = await this.deps.opportunities.findOpenByCustomerProduct({
        companyId: input.companyId,
        customerId,
        primaryProductId,
      });
      if (existingScope) return { opportunity: existingScope };
    }

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

    const probabilityPercent = input.probabilityPercent ?? stage.defaultProbabilityPercent;
    const expectedRevenue = input.expectedRevenue ?? null;
    const weightedRevenue = computeWeightedRevenue(expectedRevenue, probabilityPercent);
    const currency = resolveManualOpportunityCurrency(
      input.currency,
      input.companyDefaultCurrency,
    );
    const metadata = {
      ...(input.metadata ?? {}),
      ...identityScopeMetadata({ customerId, primaryProductId, mode: "manual" }),
    };

    let opportunity: OpportunityRecord;
    try {
      opportunity = await this.deps.opportunities.createOpportunity({
        companyId: input.companyId,
        pipelineId,
        stageId: stage.id,
        name: input.name.trim(),
        leadId: input.leadId ?? null,
        customerId,
        primaryProductId,
        primaryContactName: input.primaryContactName ?? "",
        ownerUserId: input.ownerUserId ?? actorUserId,
        companyName: input.companyName ?? null,
        country: input.country ?? null,
        market: input.market ?? null,
        language: input.language ?? null,
        currency,
        expectedRevenue,
        weightedRevenue,
        probabilityPercent,
        probabilityConfidence: null,
        probabilitySource: input.probabilitySource ?? "auto",
        probabilityReason: input.probabilityReason ?? `Default probability for ${stage.name}`,
        expectedCloseDate: input.expectedCloseDate ?? null,
        createdFromLead: Boolean(input.leadId),
        metadata,
        createdBy: actorUserId,
      });
    } catch (error) {
      if (customerId && primaryProductId && isUniqueViolationError(error)) {
        const winner = await this.deps.opportunities.findOpenByCustomerProduct({
          companyId: input.companyId,
          customerId,
          primaryProductId,
        });
        if (winner) return { opportunity: winner };
      }
      throw error;
    }

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
    input: {
      companyId: string;
      leadId: string;
      name?: string;
      companyName?: string;
      primaryContactName?: string;
      ownerUserId?: string;
      expectedRevenue?: number | null;
      currency?: string;
      expectedCloseDate?: string | null;
      stageId?: string;
      pipelineId?: string;
      /** Company billing default (e.g. from CompanyLocale runtime). */
      companyDefaultCurrency?: string;
      /**
       * Canonical catalog product for this commercial deal.
       * When set with a resolved customer, reuses the open (company, customer, product) opportunity.
       */
      primaryProductId?: string;
      forceCreate?: boolean;
      probabilityPercent?: number;
      probabilitySource?: string;
      probabilityReason?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{ opportunity: OpportunityRecord }> {
    const actorUserId = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, OPPORTUNITY_PERMISSIONS.convert);

    const lead = await this.deps.opportunities.getLeadSnapshot(input.companyId, input.leadId);
    if (!lead) throw new OpportunityValidationError("Source lead not found.");
    if (!lead.isQualified && !lead.customerId) {
      throw new OpportunityValidationError("Lead must be qualified before creating an opportunity.");
    }

    const primaryProductId =
      input.primaryProductId?.trim() ||
      (typeof input.metadata?.productInterest === "object" &&
      input.metadata.productInterest &&
      typeof (input.metadata.productInterest as { productId?: unknown }).productId === "string"
        ? String((input.metadata.productInterest as { productId: string }).productId).trim()
        : "") ||
      null;

    if (primaryProductId) {
      const product = await this.deps.opportunities.getCatalogProductInCompany(
        input.companyId,
        primaryProductId,
      );
      if (!product) {
        throw new OpportunityValidationError(
          "primaryProductId must reference an active catalog product in this company.",
          "product_not_in_company",
        );
      }
    }

    const customerId = await resolveCustomerIdForLead(this.deps.opportunities, {
      companyId: input.companyId,
      leadId: lead.id,
      customerId: lead.customerId,
      email: lead.email,
    });
    // Lead-originated opportunities always require a resolved customer. Missing identity
    // is a validation failure — never write an Opportunity the uniqueness index cannot protect.
    if (!customerId) {
      throw new OpportunityValidationError(
        "A customer identity is required before creating an opportunity from a lead. Link a customer or ensure the lead has an unambiguous email match.",
        "customer_identity_required",
      );
    }

    // Preferred uniqueness: company + customer + primary product (approved rule).
    if (!input.forceCreate && customerId && primaryProductId) {
      const byScope = await this.deps.opportunities.findOpenByCustomerProduct({
        companyId: input.companyId,
        customerId,
        primaryProductId,
      });
      if (byScope) return { opportunity: byScope };
    }

    // Soft reuse on the same lead (open only). Prefer matching primary product when known;
    // otherwise reuse a single open opp only when product scope is absent.
    if (!input.forceCreate) {
      const existing = await this.deps.opportunities.listOpportunities({
        companyId: input.companyId,
        leadId: lead.id,
        openOnly: true,
        limit: 5,
        offset: 0,
      });
      if (primaryProductId) {
        const sameProduct = existing.items.find(
          (item) => isOpenOpportunity(item) && item.primaryProductId === primaryProductId,
        );
        if (sameProduct) return { opportunity: sameProduct };
      } else {
        // General (no primary product) deals only soft-reuse another general open row —
        // never absorb a product-scoped opportunity.
        const openGeneral = existing.items.find(
          (item) => isOpenOpportunity(item) && !item.primaryProductId,
        );
        if (openGeneral) return { opportunity: openGeneral };
      }
    }

    const aiContext = extractAiContext(lead.metadata, lead.aiSummary);
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

    const probabilityPercent = input.probabilityPercent ?? stage.defaultProbabilityPercent;
    const expectedRevenue =
      input.expectedRevenue !== undefined ? input.expectedRevenue : lead.estimatedValue;
    const weightedRevenue = computeWeightedRevenue(expectedRevenue, probabilityPercent);
    const name =
      input.name?.trim() ||
      resolveDefaultOpportunityNameFromLead({
        title: lead.title,
        companyName: input.companyName ?? lead.companyName,
      });

    const currency = input.currency
      ? resolveManualOpportunityCurrency(input.currency, input.companyDefaultCurrency)
      : resolveLeadOpportunityCurrency(lead.currency, input.companyDefaultCurrency);
    const identityMeta = identityScopeMetadata({
      customerId,
      primaryProductId,
      mode: "from_lead",
    });

    let opportunity: OpportunityRecord;
    try {
      opportunity = await this.deps.opportunities.createOpportunity({
        companyId: input.companyId,
        pipelineId,
        stageId: stage.id,
        name,
        leadId: lead.id,
        customerId,
        primaryProductId,
        primaryContactName: input.primaryContactName ?? lead.contactName,
        ownerUserId: input.ownerUserId ?? lead.assignedUserId ?? actorUserId,
        companyName: input.companyName ?? lead.companyName,
        country: aiContext.country ?? lead.territory,
        market: aiContext.market,
        language: lead.language,
        currency,
        expectedRevenue,
        weightedRevenue,
        probabilityPercent,
        probabilityConfidence: null,
        probabilitySource: input.probabilitySource ?? "auto",
        probabilityReason:
          input.probabilityReason ?? `Seeded from stage ${stage.name} after lead qualification`,
        expectedCloseDate:
          input.expectedCloseDate !== undefined ? input.expectedCloseDate : lead.expectedCloseDate,
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
          ...(input.metadata ?? {}),
          ...identityMeta,
        },
        createdBy: actorUserId,
      });
    } catch (error) {
      if (!isUniqueViolationError(error)) throw error;
      // Reclaim only when the open winner matches the same commercial scope (or same
      // lead + product). Unrelated unique violations rethrow when no matching open row.
      if (customerId && primaryProductId) {
        const winner = await this.deps.opportunities.findOpenByCustomerProduct({
          companyId: input.companyId,
          customerId,
          primaryProductId,
        });
        if (winner) return { opportunity: winner };
      }
      if (primaryProductId) {
        const onLead = await this.deps.opportunities.listOpportunities({
          companyId: input.companyId,
          leadId: lead.id,
          openOnly: true,
          limit: 5,
          offset: 0,
        });
        const sameProduct = onLead.items.find(
          (item) => isOpenOpportunity(item) && item.primaryProductId === primaryProductId,
        );
        if (sameProduct) return { opportunity: sameProduct };
      }
      throw error;
    }

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
    input: {
      companyId: string;
      opportunityId: string;
      stageId: string;
      /** Required when moving to lost. */
      lostReason?: string | null;
    },
  ): Promise<{ opportunity: OpportunityRecord }> {
    const actorUserId = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, OPPORTUNITY_PERMISSIONS.edit);

    const existing = await this.deps.opportunities.getOpportunity(input.companyId, input.opportunityId);
    if (!existing) throw new OpportunityNotFoundError(input.opportunityId);

    // Soft-deleted rows are already excluded by getOpportunity; closed timestamps are an
    // additional terminal guard against stale clients / inconsistent stage rows.
    if (existing.wonAt || existing.lostAt) {
      throw new OpportunityValidationError(
        "Closed (Won/Lost) opportunities cannot change stage. Archive separately if needed.",
      );
    }

    const fromStage = await this.deps.opportunities.getStage(input.companyId, existing.stageId);
    if (!fromStage) throw new OpportunityValidationError("Current opportunity stage not found.");

    const stage = await this.deps.opportunities.getStage(input.companyId, input.stageId);
    if (!stage) throw new OpportunityValidationError("Stage not found.");

    assertOpportunityStageTransition(fromStage.stageKey, stage.stageKey);

    const lostReason =
      typeof input.lostReason === "string" ? input.lostReason.trim() : "";
    if (stage.stageKey === "lost" && !lostReason) {
      throw new OpportunityValidationError("A loss reason is required when marking an opportunity Lost.");
    }
    if (stage.stageKey === "won") {
      const accepted = this.deps.saleCompletion
        ? await this.deps.saleCompletion.hasAcceptedQuoteForOpportunity({
            companyId: input.companyId,
            opportunityId: existing.id,
          })
        : false;
      if (!accepted) {
        throw new OpportunityValidationError(
          "An accepted quote linked to this opportunity is required before Won.",
          "sale_completion_required",
        );
      }
    }

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
      lostReason: stage.stageKey === "lost" ? lostReason : existing.lostReason,
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
        summary: lostReason ? `Opportunity lost: ${lostReason}` : "Opportunity lost",
        payload: { lostReason },
        actorUserId,
      });
      await this.deps.events.publishLost({
        opportunityId: opportunity.id,
        reason: lostReason,
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

    if (
      input.expectedRevenue !== undefined &&
      input.expectedRevenue !== existing.expectedRevenue
    ) {
      await this.deps.opportunities.addHistory({
        companyId: input.companyId,
        opportunityId: opportunity.id,
        eventType: "amount_changed",
        fieldName: "expected_revenue",
        previousValue:
          existing.expectedRevenue == null ? null : String(existing.expectedRevenue),
        newValue: input.expectedRevenue == null ? null : String(input.expectedRevenue),
        summary: "Expected revenue updated",
        actorUserId,
      });
    }

    if (input.ownerUserId !== undefined && input.ownerUserId !== existing.ownerUserId) {
      await this.deps.opportunities.addHistory({
        companyId: input.companyId,
        opportunityId: opportunity.id,
        eventType: "owner_changed",
        fieldName: "owner_user_id",
        previousValue: existing.ownerUserId,
        newValue: input.ownerUserId,
        summary: "Owner changed",
        actorUserId,
      });
    }

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
    await this.deps.opportunities.addHistory({
      companyId: input.companyId,
      opportunityId: input.opportunityId,
      eventType: "archived",
      summary: "Opportunity archived",
      actorUserId,
    });
  }
}
