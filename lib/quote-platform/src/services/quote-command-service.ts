import { resolveEffectivePrice } from "@workspace/product-platform";
import { QUOTE_PERMISSIONS, QUOTE_STATUSES } from "../constants.js";
import { QuoteNotFoundError, QuotePermissionError, QuoteValidationError } from "../errors.js";
import type { QuoteRepository } from "../repositories/quote-repository-port.js";
import {
  computeQuoteLineAmounts,
  computeQuoteTotals,
  computeWeightedRevenue,
  type QuoteLineItemRecord,
  type QuoteLineKind,
  type QuoteRecord,
  type QuoteServiceContext,
  type QuoteStatus,
  type QuoteTemplateRecord,
} from "../types.js";

export type QuoteEventPublisherPort = {
  publishCreated(input: {
    quoteId: string;
    quoteNumber: string;
    opportunityId?: string | null;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishUpdated(input: {
    quoteId: string;
    changedFields: string[];
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishSent(input: {
    quoteId: string;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishViewed(input: {
    quoteId: string;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishAccepted(input: {
    quoteId: string;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishRejected(input: {
    quoteId: string;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishExpired(input: {
    quoteId: string;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishVersionCreated(input: {
    quoteId: string;
    previousQuoteId: string;
    versionNumber: number;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishOpportunityQuoteCreated(input: {
    opportunityId: string;
    quoteId: string;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
};

function assertActor(ctx: QuoteServiceContext): string {
  if (!ctx.userId) throw new QuoteValidationError("Authenticated actor required.");
  return ctx.userId;
}

function assertCompany(ctx: QuoteServiceContext, companyId: string) {
  if (!ctx.isSuperAdmin && ctx.companyId !== companyId) {
    throw new QuotePermissionError("tenant");
  }
}

function assertPermission(ctx: QuoteServiceContext, code: string) {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(code)) throw new QuotePermissionError(code);
}

function addDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mapProductTypeToLineKind(productType: string): QuoteLineKind {
  if (productType === "service") return "service";
  if (productType === "bundle") return "bundle";
  if (productType === "addon") return "addon";
  return "product";
}

async function refreshTotals(
  repo: QuoteRepository,
  companyId: string,
  quoteId: string,
  actorUserId: string | null,
): Promise<QuoteRecord> {
  const quote = await repo.getQuote(companyId, quoteId);
  if (!quote) throw new QuoteNotFoundError(quoteId);
  const lines = await repo.listLines(companyId, quoteId);
  const totals = computeQuoteTotals(lines);
  return repo.updateQuote({
    companyId,
    quoteId,
    updatedBy: actorUserId,
    ...totals,
    weightedRevenue: computeWeightedRevenue(totals.grandTotal, quote.opportunityProbabilityPercent),
  });
}

export class QuoteCommandService {
  constructor(
    private readonly deps: {
      quotes: QuoteRepository;
      events: QuoteEventPublisherPort;
    },
  ) {}

  async createFromOpportunity(
    ctx: QuoteServiceContext,
    input: {
      companyId: string;
      opportunityId: string;
      templateId?: string | null;
      title?: string;
    },
  ): Promise<{ quote: QuoteRecord; lines: QuoteLineItemRecord[] }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.create);

    const opportunity = await this.deps.quotes.getOpportunitySnapshot(
      input.companyId,
      input.opportunityId,
    );
    if (!opportunity) throw new QuoteValidationError("Opportunity not found.");

    await this.deps.quotes.ensureDefaultTemplates(input.companyId);
    let template: QuoteTemplateRecord | null = null;
    if (input.templateId) {
      template = await this.deps.quotes.getTemplate(input.companyId, input.templateId);
    }

    const quoteNumber = await this.deps.quotes.nextQuoteNumber(input.companyId);
    const familyId = crypto.randomUUID();
    const validityDays = template?.validityDays ?? 30;

    const quote = await this.deps.quotes.createQuote({
      companyId: input.companyId,
      quoteFamilyId: familyId,
      versionNumber: 1,
      quoteNumber,
      opportunityId: opportunity.id,
      customerId: opportunity.customerId,
      templateId: template?.id ?? null,
      status: "draft",
      title: input.title?.trim() || opportunity.name,
      contactName: opportunity.primaryContactName,
      currency: opportunity.currency || template?.defaultCurrency || "USD",
      language: opportunity.language || template?.defaultLanguage || "en",
      country: opportunity.country,
      market: opportunity.market,
      validUntil: addDays(validityDays),
      ownerUserId: opportunity.ownerUserId ?? actor,
      opportunityProbabilityPercent: opportunity.probabilityPercent,
      createdBy: actor,
      metadata: { createdFrom: "opportunity" },
    });

    const oppLines = await this.deps.quotes.listOpportunityLines(input.companyId, opportunity.id);
    const lines: QuoteLineItemRecord[] = [];
    for (const [index, oppLine] of oppLines.entries()) {
      const amounts = computeQuoteLineAmounts({
        quantity: oppLine.quantity,
        unitPrice: oppLine.unitPrice,
        discountPercent: oppLine.discountPercent,
        taxPercent: oppLine.taxPercent,
      });
      const product = await this.deps.quotes.getCatalogProduct(input.companyId, oppLine.productId);
      lines.push(
        await this.deps.quotes.upsertLine({
          companyId: input.companyId,
          quoteId: quote.id,
          lineKind: product ? mapProductTypeToLineKind(product.productType) : "product",
          productId: oppLine.productId,
          productNameSnapshot: oppLine.productNameSnapshot,
          skuSnapshot: oppLine.skuSnapshot,
          quantity: oppLine.quantity,
          unitPrice: oppLine.unitPrice,
          discountPercent: oppLine.discountPercent,
          discountAmount: amounts.discountAmount,
          taxPercent: oppLine.taxPercent,
          currency: oppLine.currency,
          subtotal: amounts.subtotal,
          taxAmount: amounts.taxAmount,
          total: amounts.total,
          sortOrder: index,
          actorUserId: actor,
        }),
      );
    }

    const withTotals = await refreshTotals(this.deps.quotes, input.companyId, quote.id, actor);
    await this.deps.quotes.setOpportunityCurrentQuote({
      companyId: input.companyId,
      opportunityId: opportunity.id,
      quoteId: withTotals.id,
    });

    await this.deps.quotes.addHistory({
      companyId: input.companyId,
      quoteId: withTotals.id,
      eventType: "quote_created",
      summary: `Quote ${withTotals.quoteNumber} created from opportunity`,
      actorUserId: actor,
    });

    await this.deps.events.publishCreated({
      quoteId: withTotals.id,
      quoteNumber: withTotals.quoteNumber,
      opportunityId: opportunity.id,
      companyId: input.companyId,
      actorUserId: actor,
    });
    await this.deps.events.publishOpportunityQuoteCreated({
      opportunityId: opportunity.id,
      quoteId: withTotals.id,
      companyId: input.companyId,
      actorUserId: actor,
    });

    return { quote: withTotals, lines: await this.deps.quotes.listLines(input.companyId, withTotals.id) };
  }

  async createManual(
    ctx: QuoteServiceContext,
    input: {
      companyId: string;
      title: string;
      opportunityId?: string;
      templateId?: string | null;
      currency?: string;
      contactName?: string;
    },
  ): Promise<{ quote: QuoteRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.create);
    await this.deps.quotes.ensureDefaultTemplates(input.companyId);

    const quoteNumber = await this.deps.quotes.nextQuoteNumber(input.companyId);
    const quote = await this.deps.quotes.createQuote({
      companyId: input.companyId,
      quoteFamilyId: crypto.randomUUID(),
      versionNumber: 1,
      quoteNumber,
      opportunityId: input.opportunityId ?? null,
      templateId: input.templateId ?? null,
      title: input.title.trim(),
      contactName: input.contactName ?? "",
      currency: input.currency ?? "USD",
      validUntil: addDays(30),
      ownerUserId: actor,
      createdBy: actor,
    });

    if (input.opportunityId) {
      await this.deps.quotes.setOpportunityCurrentQuote({
        companyId: input.companyId,
        opportunityId: input.opportunityId,
        quoteId: quote.id,
      });
    }

    await this.deps.quotes.addHistory({
      companyId: input.companyId,
      quoteId: quote.id,
      eventType: "quote_created",
      summary: `Quote ${quote.quoteNumber} created`,
      actorUserId: actor,
    });
    await this.deps.events.publishCreated({
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      opportunityId: quote.opportunityId,
      companyId: input.companyId,
      actorUserId: actor,
    });

    return { quote };
  }

  async createVersion(
    ctx: QuoteServiceContext,
    input: { companyId: string; quoteId: string },
  ): Promise<{ quote: QuoteRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.edit);

    const existing = await this.deps.quotes.getQuote(input.companyId, input.quoteId);
    if (!existing) throw new QuoteNotFoundError(input.quoteId);

    const versions = await this.deps.quotes.listVersions(input.companyId, existing.quoteFamilyId);
    const nextVersion = Math.max(...versions.map((v) => v.versionNumber)) + 1;

    for (const version of versions.filter((v) => v.isCurrent)) {
      await this.deps.quotes.updateQuote({
        companyId: input.companyId,
        quoteId: version.id,
        updatedBy: actor,
        isCurrent: false,
      });
    }

    const quote = await this.deps.quotes.createQuote({
      companyId: input.companyId,
      quoteFamilyId: existing.quoteFamilyId,
      versionNumber: nextVersion,
      quoteNumber: existing.quoteNumber,
      opportunityId: existing.opportunityId,
      customerId: existing.customerId,
      templateId: existing.templateId,
      status: "draft",
      title: existing.title,
      contactName: existing.contactName,
      currency: existing.currency,
      language: existing.language,
      country: existing.country,
      market: existing.market,
      validUntil: existing.validUntil,
      ownerUserId: existing.ownerUserId ?? actor,
      notes: existing.notes,
      opportunityProbabilityPercent: existing.opportunityProbabilityPercent,
      isCurrent: true,
      createdBy: actor,
      metadata: { ...existing.metadata, previousVersionId: existing.id },
    });

    await this.deps.quotes.updateQuote({
      companyId: input.companyId,
      quoteId: existing.id,
      updatedBy: actor,
      supersededByQuoteId: quote.id,
      isCurrent: false,
    });

    await this.deps.quotes.copyLines({
      companyId: input.companyId,
      fromQuoteId: existing.id,
      toQuoteId: quote.id,
      actorUserId: actor,
    });

    const withTotals = await refreshTotals(this.deps.quotes, input.companyId, quote.id, actor);

    if (withTotals.opportunityId) {
      await this.deps.quotes.setOpportunityCurrentQuote({
        companyId: input.companyId,
        opportunityId: withTotals.opportunityId,
        quoteId: withTotals.id,
      });
    }

    await this.deps.quotes.addHistory({
      companyId: input.companyId,
      quoteId: withTotals.id,
      eventType: "quote_version_created",
      summary: `Version ${nextVersion} created from v${existing.versionNumber}`,
      payload: { previousQuoteId: existing.id },
      actorUserId: actor,
    });

    await this.deps.events.publishVersionCreated({
      quoteId: withTotals.id,
      previousQuoteId: existing.id,
      versionNumber: nextVersion,
      companyId: input.companyId,
      actorUserId: actor,
    });

    return { quote: withTotals };
  }

  async addCatalogProduct(
    ctx: QuoteServiceContext,
    input: {
      companyId: string;
      quoteId: string;
      productId: string;
      quantity?: number;
      discountPercent?: number;
      taxPercent?: number;
    },
  ): Promise<{ line: QuoteLineItemRecord; quote: QuoteRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.edit);

    const quote = await this.deps.quotes.getQuote(input.companyId, input.quoteId);
    if (!quote) throw new QuoteNotFoundError(input.quoteId);
    if (!["draft", "internal_review"].includes(quote.status)) {
      throw new QuoteValidationError("Only draft/internal review quotes can be edited. Create a new version.");
    }

    const product = await this.deps.quotes.getCatalogProduct(input.companyId, input.productId);
    if (!product || !product.isActive) throw new QuoteValidationError("Product not found or inactive.");

    const regional = await this.deps.quotes.listRegionalPrices(input.companyId, product.id);
    const priced = resolveEffectivePrice({
      basePrice:
        product.productType === "subscription" && product.subscriptionPrice != null
          ? product.subscriptionPrice
          : product.basePrice,
      currency: product.currency,
      regionalPrices: regional.map((r, i) => ({
        id: String(i),
        companyId: input.companyId,
        productId: product.id,
        country: r.country,
        market: r.market,
        region: r.region,
        localPrice: r.localPrice,
        currencyOverride: r.currencyOverride,
        isActive: r.isActive,
        createdAt: "",
        updatedAt: "",
      })),
      country: quote.country,
      market: quote.market,
    });

    const quantity = input.quantity ?? 1;
    const discountPercent = input.discountPercent ?? 0;
    const taxPercent = input.taxPercent ?? 0;
    const amounts = computeQuoteLineAmounts({
      quantity,
      unitPrice: priced.unitPrice,
      discountPercent,
      taxPercent,
    });

    const existingLines = await this.deps.quotes.listLines(input.companyId, quote.id);
    const line = await this.deps.quotes.upsertLine({
      companyId: input.companyId,
      quoteId: quote.id,
      lineKind: mapProductTypeToLineKind(product.productType),
      productId: product.id,
      productNameSnapshot: product.name,
      skuSnapshot: product.sku,
      quantity,
      unitPrice: priced.unitPrice,
      discountPercent,
      discountAmount: amounts.discountAmount,
      taxPercent,
      currency: priced.currency,
      subtotal: amounts.subtotal,
      taxAmount: amounts.taxAmount,
      total: amounts.total,
      sortOrder: existingLines.length,
      actorUserId: actor,
    });

    const updated = await refreshTotals(this.deps.quotes, input.companyId, quote.id, actor);
    await this.deps.events.publishUpdated({
      quoteId: quote.id,
      changedFields: ["lines"],
      companyId: input.companyId,
      actorUserId: actor,
    });

    return { line, quote: updated };
  }

  async updateLine(
    ctx: QuoteServiceContext,
    input: {
      companyId: string;
      quoteId: string;
      lineId: string;
      quantity?: number;
      unitPrice?: number;
      discountPercent?: number;
      discountAmount?: number;
      taxPercent?: number;
    },
  ): Promise<{ line: QuoteLineItemRecord; quote: QuoteRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.edit);

    const quote = await this.deps.quotes.getQuote(input.companyId, input.quoteId);
    if (!quote) throw new QuoteNotFoundError(input.quoteId);
    if (!["draft", "internal_review"].includes(quote.status)) {
      throw new QuoteValidationError("Create a new version to edit sent quotes.");
    }

    const lines = await this.deps.quotes.listLines(input.companyId, input.quoteId);
    const existing = lines.find((l) => l.id === input.lineId);
    if (!existing) throw new QuoteValidationError("Line not found.");

    const quantity = input.quantity ?? existing.quantity;
    const unitPrice = input.unitPrice ?? existing.unitPrice;
    const discountPercent = input.discountPercent ?? existing.discountPercent;
    const taxPercent = input.taxPercent ?? existing.taxPercent;
    const amounts = computeQuoteLineAmounts({
      quantity,
      unitPrice,
      discountPercent,
      discountAmount: input.discountAmount,
      taxPercent,
    });

    const line = await this.deps.quotes.upsertLine({
      companyId: input.companyId,
      quoteId: input.quoteId,
      id: input.lineId,
      lineKind: existing.lineKind,
      productId: existing.productId,
      productNameSnapshot: existing.productNameSnapshot,
      skuSnapshot: existing.skuSnapshot,
      sectionTitle: existing.sectionTitle,
      notes: existing.notes,
      isOptional: existing.isOptional,
      quantity,
      unitPrice,
      discountPercent,
      discountAmount: amounts.discountAmount,
      taxPercent,
      currency: existing.currency,
      subtotal: amounts.subtotal,
      taxAmount: amounts.taxAmount,
      total: amounts.total,
      sortOrder: existing.sortOrder,
      actorUserId: actor,
    });

    const updated = await refreshTotals(this.deps.quotes, input.companyId, input.quoteId, actor);
    return { line, quote: updated };
  }

  async removeLine(
    ctx: QuoteServiceContext,
    input: { companyId: string; quoteId: string; lineId: string },
  ): Promise<{ quote: QuoteRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.edit);
    await this.deps.quotes.removeLine(input.companyId, input.lineId, actor);
    const quote = await refreshTotals(this.deps.quotes, input.companyId, input.quoteId, actor);
    return { quote };
  }

  async changeStatus(
    ctx: QuoteServiceContext,
    input: { companyId: string; quoteId: string; status: QuoteStatus },
  ): Promise<{ quote: QuoteRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    if (!(QUOTE_STATUSES as readonly string[]).includes(input.status)) {
      throw new QuoteValidationError("Invalid quote status.");
    }

    if (input.status === "sent") assertPermission(ctx, QUOTE_PERMISSIONS.send);
    else assertPermission(ctx, QUOTE_PERMISSIONS.edit);

    const existing = await this.deps.quotes.getQuote(input.companyId, input.quoteId);
    if (!existing) throw new QuoteNotFoundError(input.quoteId);

    const nowIso = new Date().toISOString();
    const patch: Parameters<QuoteRepository["updateQuote"]>[0] = {
      companyId: input.companyId,
      quoteId: input.quoteId,
      updatedBy: actor,
      status: input.status,
    };
    if (input.status === "sent") patch.sentAt = nowIso;
    if (input.status === "viewed") patch.viewedAt = nowIso;
    if (input.status === "accepted") patch.acceptedAt = nowIso;
    if (input.status === "rejected") patch.rejectedAt = nowIso;
    if (input.status === "expired") patch.expiredAt = nowIso;
    if (input.status === "converted") patch.convertedAt = nowIso;

    const quote = await this.deps.quotes.updateQuote(patch);
    await this.deps.quotes.addHistory({
      companyId: input.companyId,
      quoteId: quote.id,
      eventType: `quote_${input.status}`,
      fieldName: "status",
      previousValue: existing.status,
      newValue: input.status,
      summary: `Status changed to ${input.status}`,
      actorUserId: actor,
    });

    if (input.status === "sent") {
      await this.deps.events.publishSent({
        quoteId: quote.id,
        companyId: input.companyId,
        actorUserId: actor,
      });
    } else if (input.status === "viewed") {
      await this.deps.events.publishViewed({
        quoteId: quote.id,
        companyId: input.companyId,
        actorUserId: actor,
      });
    } else if (input.status === "accepted") {
      await this.deps.events.publishAccepted({
        quoteId: quote.id,
        companyId: input.companyId,
        actorUserId: actor,
      });
    } else if (input.status === "rejected") {
      await this.deps.events.publishRejected({
        quoteId: quote.id,
        companyId: input.companyId,
        actorUserId: actor,
      });
    } else if (input.status === "expired") {
      await this.deps.events.publishExpired({
        quoteId: quote.id,
        companyId: input.companyId,
        actorUserId: actor,
      });
    } else {
      await this.deps.events.publishUpdated({
        quoteId: quote.id,
        changedFields: ["status"],
        companyId: input.companyId,
        actorUserId: actor,
      });
    }

    return { quote };
  }

  async requestApproval(
    ctx: QuoteServiceContext,
    input: { companyId: string; quoteId: string },
  ): Promise<{ quote: QuoteRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.edit);

    const quote = await this.deps.quotes.getQuote(input.companyId, input.quoteId);
    if (!quote) throw new QuoteNotFoundError(input.quoteId);

    await this.deps.quotes.createApproval({
      companyId: input.companyId,
      quoteId: input.quoteId,
      requestedBy: actor,
    });

    const updated = await this.deps.quotes.updateQuote({
      companyId: input.companyId,
      quoteId: input.quoteId,
      updatedBy: actor,
      status: "internal_review",
    });

    await this.deps.quotes.addHistory({
      companyId: input.companyId,
      quoteId: input.quoteId,
      eventType: "approval_requested",
      summary: "Internal approval requested",
      actorUserId: actor,
    });

    return { quote: updated };
  }

  async decideApproval(
    ctx: QuoteServiceContext,
    input: {
      companyId: string;
      quoteId: string;
      approvalId: string;
      status: "approved" | "rejected";
      decisionNote?: string;
    },
  ): Promise<{ quote: QuoteRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.approve);

    await this.deps.quotes.decideApproval({
      companyId: input.companyId,
      approvalId: input.approvalId,
      status: input.status,
      decidedBy: actor,
      decisionNote: input.decisionNote,
    });

    const nextStatus: QuoteStatus = input.status === "approved" ? "draft" : "rejected";
    const quote = await this.deps.quotes.updateQuote({
      companyId: input.companyId,
      quoteId: input.quoteId,
      updatedBy: actor,
      status: nextStatus,
      rejectedAt: input.status === "rejected" ? new Date().toISOString() : undefined,
    });

    await this.deps.quotes.addHistory({
      companyId: input.companyId,
      quoteId: input.quoteId,
      eventType: "approval_decided",
      summary: `Approval ${input.status}`,
      actorUserId: actor,
    });

    return { quote };
  }

  async archive(
    ctx: QuoteServiceContext,
    input: { companyId: string; quoteId: string },
  ): Promise<void> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.delete);
    await this.deps.quotes.softDeleteQuote(input.companyId, input.quoteId, actor);
  }
}
