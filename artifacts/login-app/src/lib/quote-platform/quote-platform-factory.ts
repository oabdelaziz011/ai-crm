import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createQuotePlatformServices,
  createNoopQuoteEventPublisher,
  type QuoteEventPublisherPort,
  type QuotePlatformServices,
  type QuoteLineItemRecord,
  type QuoteRecord,
} from "@workspace/quote-platform";
import { createSupabaseOpportunityRepository } from "@workspace/opportunity-platform";
import { createModulePublisher } from "@workspace/platform-events";
import type {
  QuoteLineItemReadModel,
  QuoteReadModel,
} from "@workspace/application-layer";
import { getLoginAppPlatformEventBus } from "@/lib/application-layer/platform-event-bus-factory.js";

export function createQuoteEventBridge(): QuoteEventPublisherPort {
  const bus = () => createModulePublisher(getLoginAppPlatformEventBus(), "quotes");

  return {
    async publishCreated(input) {
      await bus().publish(
        "QuoteCreated",
        {
          quoteId: input.quoteId,
          quoteNumber: input.quoteNumber,
          opportunityId: input.opportunityId,
          companyId: input.companyId,
        },
        {
          tenantId: input.companyId,
          correlationId: `${input.quoteId}:created`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "quotes",
          entityType: "quote",
          entityId: input.quoteId,
        },
      );
    },
    async publishUpdated(input) {
      await bus().publish(
        "QuoteUpdated",
        {
          quoteId: input.quoteId,
          changedFields: input.changedFields,
          companyId: input.companyId,
        },
        {
          tenantId: input.companyId,
          correlationId: `${input.quoteId}:updated`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "quotes",
          entityType: "quote",
          entityId: input.quoteId,
        },
      );
    },
    async publishSent(input) {
      await bus().publish(
        "QuoteSent",
        { quoteId: input.quoteId, companyId: input.companyId },
        {
          tenantId: input.companyId,
          correlationId: `${input.quoteId}:sent`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "quotes",
          entityType: "quote",
          entityId: input.quoteId,
        },
      );
    },
    async publishViewed(input) {
      await bus().publish(
        "QuoteViewed",
        { quoteId: input.quoteId, companyId: input.companyId },
        {
          tenantId: input.companyId,
          correlationId: `${input.quoteId}:viewed`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "quotes",
          entityType: "quote",
          entityId: input.quoteId,
        },
      );
    },
    async publishAccepted(input) {
      await bus().publish(
        "QuoteAccepted",
        { quoteId: input.quoteId, companyId: input.companyId },
        {
          tenantId: input.companyId,
          correlationId: `${input.quoteId}:accepted`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "quotes",
          entityType: "quote",
          entityId: input.quoteId,
        },
      );
    },
    async publishRejected(input) {
      await bus().publish(
        "QuoteRejected",
        { quoteId: input.quoteId, companyId: input.companyId },
        {
          tenantId: input.companyId,
          correlationId: `${input.quoteId}:rejected`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "quotes",
          entityType: "quote",
          entityId: input.quoteId,
        },
      );
    },
    async publishExpired(input) {
      await bus().publish(
        "QuoteExpired",
        { quoteId: input.quoteId, companyId: input.companyId },
        {
          tenantId: input.companyId,
          correlationId: `${input.quoteId}:expired`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "quotes",
          entityType: "quote",
          entityId: input.quoteId,
        },
      );
    },
    async publishVersionCreated(input) {
      await bus().publish(
        "QuoteVersionCreated",
        {
          quoteId: input.quoteId,
          previousQuoteId: input.previousQuoteId,
          versionNumber: input.versionNumber,
          companyId: input.companyId,
        },
        {
          tenantId: input.companyId,
          correlationId: `${input.quoteId}:version`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "quotes",
          entityType: "quote",
          entityId: input.quoteId,
        },
      );
    },
    async publishOpportunityQuoteCreated(input) {
      await bus().publish(
        "OpportunityQuoteCreated",
        {
          opportunityId: input.opportunityId,
          quoteId: input.quoteId,
          companyId: input.companyId,
        },
        {
          tenantId: input.companyId,
          correlationId: `${input.opportunityId}:quote`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "opportunities",
          entityType: "opportunity",
          entityId: input.opportunityId,
        },
      );
    },
  };
}

export function createLoginAppQuotePlatformServices(client: SupabaseClient): QuotePlatformServices {
  const opportunities = createSupabaseOpportunityRepository(client);
  return createQuotePlatformServices(client, {
    events: createQuoteEventBridge(),
    opportunityHistory: {
      addHistory: async (input) => {
        await opportunities.addHistory(input);
      },
    },
  });
}

export function createLoginAppQuotePlatformServicesSilent(
  client: SupabaseClient,
): QuotePlatformServices {
  return createQuotePlatformServices(client, { events: createNoopQuoteEventPublisher() });
}

export function mapQuote(record: QuoteRecord): QuoteReadModel {
  return Object.freeze({
    id: record.id,
    tenantId: record.companyId,
    quoteFamilyId: record.quoteFamilyId,
    versionNumber: record.versionNumber,
    quoteNumber: record.quoteNumber,
    opportunityId: record.opportunityId,
    customerId: record.customerId,
    templateId: record.templateId,
    status: record.status,
    title: record.title,
    contactName: record.contactName,
    currency: record.currency,
    language: record.language,
    country: record.country,
    market: record.market,
    validUntil: record.validUntil,
    ownerUserId: record.ownerUserId,
    subtotal: record.subtotal,
    discountTotal: record.discountTotal,
    taxTotal: record.taxTotal,
    shippingTotal: record.shippingTotal,
    grandTotal: record.grandTotal,
    weightedRevenue: record.weightedRevenue,
    opportunityProbabilityPercent: record.opportunityProbabilityPercent,
    notes: record.notes,
    isCurrent: record.isCurrent,
    supersededByQuoteId: record.supersededByQuoteId,
    sentAt: record.sentAt,
    viewedAt: record.viewedAt,
    acceptedAt: record.acceptedAt,
    rejectedAt: record.rejectedAt,
    expiredAt: record.expiredAt,
    convertedAt: record.convertedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function mapQuoteLine(record: QuoteLineItemRecord): QuoteLineItemReadModel {
  return Object.freeze({
    id: record.id,
    quoteId: record.quoteId,
    lineKind: record.lineKind,
    productId: record.productId,
    productName: record.productNameSnapshot,
    sku: record.skuSnapshot,
    sectionTitle: record.sectionTitle,
    notes: record.notes,
    isOptional: record.isOptional,
    quantity: record.quantity,
    unitPrice: record.unitPrice,
    discountPercent: record.discountPercent,
    discountAmount: record.discountAmount,
    taxPercent: record.taxPercent,
    currency: record.currency,
    subtotal: record.subtotal,
    taxAmount: record.taxAmount,
    total: record.total,
    sortOrder: record.sortOrder,
  });
}
