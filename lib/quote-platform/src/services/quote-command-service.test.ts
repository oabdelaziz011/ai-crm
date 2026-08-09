import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { QuoteRepository } from "../repositories/quote-repository-port.js";
import type { QuoteApprovalRecord, QuoteHistoryRecord, QuoteLineItemRecord, QuoteRecord } from "../types.js";
import { QuoteCommandService } from "./quote-command-service.js";

function createRepository(overrides: Partial<QuoteRepository> = {}): QuoteRepository & {
  getCreatedQuote: () => QuoteRecord | null;
  getCreatedLines: () => QuoteLineItemRecord[];
} {
  let createdQuote: QuoteRecord | null = null;
  let createdLines: QuoteLineItemRecord[] = [];

  const opportunity = {
    id: "opp-1",
    name: "Enterprise Deal",
    customerId: "cust-1",
    companyName: null,
    primaryContactName: "Jane",
    ownerUserId: "user-1",
    currency: "EGP",
    language: "en",
    country: "EG",
    market: null,
    probabilityPercent: 25,
    expectedRevenue: 1000,
  };

  const base: QuoteRepository = {
    ensureDefaultTemplates: async () => {},
    listTemplates: async () => [],
    getTemplate: async () => null,
    nextQuoteNumber: async () => "Q-1001",
    getOpportunitySnapshot: async () => opportunity,
    createQuote: async (input) => {
      createdQuote = {
        id: "quote-1",
        companyId: input.companyId,
        quoteFamilyId: input.quoteFamilyId,
        versionNumber: input.versionNumber,
        quoteNumber: input.quoteNumber,
        opportunityId: input.opportunityId ?? null,
        customerId: input.customerId ?? null,
        templateId: input.templateId ?? null,
        status: input.status ?? "draft",
        title: input.title ?? "",
        contactName: input.contactName ?? "",
        currency: input.currency ?? "",
        language: input.language ?? "en",
        country: input.country ?? null,
        market: input.market ?? null,
        validUntil: input.validUntil ?? null,
        ownerUserId: input.ownerUserId ?? null,
        opportunityProbabilityPercent: input.opportunityProbabilityPercent ?? null,
        subtotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        shippingTotal: 0,
        grandTotal: 0,
        weightedRevenue: null,
        metadata: input.metadata ?? {},
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
        createdAt: "",
        updatedAt: "",
      };
      return createdQuote;
    },
    listOpportunityLines: async () => [
      {
        productId: "prod-1",
        productNameSnapshot: "Widget",
        skuSnapshot: "W-1",
        quantity: 1,
        unitPrice: 100,
        discountPercent: 0,
        taxPercent: 0,
        currency: "USD",
      },
    ],
    getCatalogProduct: async () => ({
      id: "prod-1",
      productType: "product",
      name: "Widget",
      sku: "W-1",
      basePrice: 100,
      currency: "USD",
      subscriptionPrice: null,
      isActive: true,
    }),
    upsertLine: async (input) => {
      const line: QuoteLineItemRecord = {
        id: `line-${createdLines.length + 1}`,
        companyId: input.companyId,
        quoteId: input.quoteId,
        lineKind: input.lineKind,
        productId: input.productId ?? null,
        productNameSnapshot: input.productNameSnapshot,
        skuSnapshot: input.skuSnapshot ?? "",
        sectionTitle: input.sectionTitle ?? null,
        notes: input.notes ?? "",
        isOptional: input.isOptional ?? false,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        discountPercent: input.discountPercent,
        discountAmount: input.discountAmount,
        taxPercent: input.taxPercent,
        currency: input.currency,
        subtotal: input.subtotal,
        taxAmount: input.taxAmount,
        total: input.total,
        sortOrder: input.sortOrder ?? 0,
        createdAt: "",
        updatedAt: "",
      };
      createdLines.push(line);
      return line;
    },
    updateQuote: async (input) => {
      createdQuote = {
        ...(createdQuote as QuoteRecord),
        ...input,
        id: input.quoteId,
        updatedBy: input.updatedBy,
      };
      return createdQuote as QuoteRecord;
    },
    setOpportunityCurrentQuote: async () => {},
    addHistory: async () => ({}) as QuoteHistoryRecord,
    getQuote: async () => createdQuote,
    listLines: async () => createdLines,
    listQuotes: async () => ({ items: [], total: 0 }),
    softDeleteQuote: async () => {},
    listVersions: async () => [],
    removeLine: async () => {},
    copyLines: async () => [],
    createApproval: async () => ({}) as QuoteApprovalRecord,
    decideApproval: async () => ({}) as QuoteApprovalRecord,
    listApprovals: async () => [],
    listHistory: async () => [],
    listRegionalPrices: async () => [],
  };

  const repo = { ...base, ...overrides };
  return Object.assign(repo, {
    getCreatedQuote: () => createdQuote,
    getCreatedLines: () => createdLines,
  });
}

const ctx = {
  userId: "user-1",
  companyId: "company-1",
  isSuperAdmin: true,
  hasPermission: () => true,
};

const noopEvents = {
  async publishCreated() {},
  async publishUpdated() {},
  async publishSent() {},
  async publishViewed() {},
  async publishAccepted() {},
  async publishRejected() {},
  async publishExpired() {},
  async publishVersionCreated() {},
  async publishOpportunityQuoteCreated() {},
};

describe("QuoteCommandService.createFromOpportunity", () => {
  it("uses opportunity currency for quote header and line items", async () => {
    const quotes = createRepository();
    const service = new QuoteCommandService({
      quotes,
      events: noopEvents,
    });

    const result = await service.createFromOpportunity(ctx, {
      companyId: "company-1",
      opportunityId: "opp-1",
    });

    assert.equal(result.quote.currency, "EGP");
    assert.equal(result.lines[0]?.currency, "EGP");
    assert.equal(quotes.getCreatedQuote()?.currency, "EGP");
  });

  it("sets validUntil to 14 days from creation by default", async () => {
    const quotes = createRepository();
    const service = new QuoteCommandService({
      quotes,
      events: noopEvents,
    });

    const before = Date.now();
    const result = await service.createFromOpportunity(ctx, {
      companyId: "company-1",
      opportunityId: "opp-1",
    });
    const expected = new Date();
    expected.setUTCDate(expected.getUTCDate() + 14);
    const expectedDate = expected.toISOString().slice(0, 10);
    // Allow 1-day slack if the call crossed UTC midnight.
    const dayBefore = new Date(before);
    dayBefore.setUTCDate(dayBefore.getUTCDate() + 14);
    const alt = dayBefore.toISOString().slice(0, 10);

    assert.ok(
      result.quote.validUntil === expectedDate || result.quote.validUntil === alt,
      `expected ${expectedDate} or ${alt}, got ${result.quote.validUntil}`,
    );
  });

  it("writes quote_created opportunity history", async () => {
    const history: Array<Record<string, unknown>> = [];
    const quotes = createRepository();
    const service = new QuoteCommandService({
      quotes,
      events: noopEvents,
      opportunityHistory: {
        addHistory: async (input) => {
          history.push({ ...input });
        },
      },
    });

    await service.createFromOpportunity(ctx, {
      companyId: "company-1",
      opportunityId: "opp-1",
    });

    assert.equal(history.length, 1);
    assert.equal(history[0]?.eventType, "quote_created");
    assert.equal(history[0]?.opportunityId, "opp-1");
    assert.match(String(history[0]?.summary), /Q-1001/);
  });
});
