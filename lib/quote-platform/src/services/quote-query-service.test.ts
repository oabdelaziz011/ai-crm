import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QuotePermissionError } from "../errors.js";
import type { QuoteRepository } from "../repositories/quote-repository-port.js";
import type { QuoteRecord, QuoteServiceContext } from "../types.js";
import { QuoteQueryService } from "./quote-query-service.js";

function baseQuote(overrides: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: "quote-1",
    companyId: "company-a",
    quoteFamilyId: "family-1",
    versionNumber: 1,
    quoteNumber: "Q-0001",
    opportunityId: null,
    customerId: null,
    templateId: null,
    status: "draft",
    title: "Fixture Quote",
    contactName: "Contact",
    currency: "EGP",
    language: "en",
    country: null,
    market: null,
    validUntil: null,
    ownerUserId: null,
    subtotal: 100,
    discountTotal: 0,
    taxTotal: 0,
    shippingTotal: 0,
    grandTotal: 100,
    weightedRevenue: null,
    opportunityProbabilityPercent: null,
    notes: "",
    isCurrent: true,
    supersededByQuoteId: null,
    sentAt: null,
    viewedAt: null,
    acceptedAt: null,
    rejectedAt: null,
    expiredAt: null,
    convertedAt: null,
    metadata: {},
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeRepo(store: Map<string, QuoteRecord>): QuoteRepository {
  return {
    ensureDefaultTemplates: async () => {},
    listTemplates: async () => [],
    getTemplate: async () => null,
    nextQuoteNumber: async () => "Q-1",
    getOpportunitySnapshot: async () => null,
    createQuote: async () => baseQuote(),
    updateQuote: async () => baseQuote(),
    softDeleteQuote: async () => {},
    getQuote: async (companyId, quoteId) => {
      const row = store.get(quoteId);
      if (!row || row.companyId !== companyId) return null;
      return row;
    },
    listQuotes: async () => ({ items: [], total: 0 }),
    listVersions: async () => [],
    listLines: async () => [],
    upsertLine: async () => ({}) as never,
    removeLine: async () => {},
    listApprovals: async () => [],
    createApproval: async () => ({}) as never,
    updateApproval: async () => ({}) as never,
    listHistory: async () => [],
    addHistory: async () => ({}) as never,
    setOpportunityCurrentQuote: async () => {},
  } as unknown as QuoteRepository;
}

describe("QuoteQueryService.getQuote", () => {
  const quote = baseQuote();
  const repo = makeRepo(new Map([[quote.id, quote]]));
  const svc = new QuoteQueryService({ quotes: repo });

  const ctxA: QuoteServiceContext = {
    userId: "user-1",
    companyId: "company-a",
    isSuperAdmin: false,
    hasPermission: (code) => code === "quotes.view",
  };

  it("loads a quote for the same company when quotes.view is present", async () => {
    const loaded = await svc.getQuote(ctxA, "company-a", "quote-1");
    assert.ok(loaded);
    assert.equal(loaded?.title, "Fixture Quote");
    assert.equal(loaded?.opportunityId, null);
  });

  it("returns null for a missing quote id", async () => {
    const loaded = await svc.getQuote(ctxA, "company-a", "missing-id");
    assert.equal(loaded, null);
  });

  it("returns null when quote belongs to another company (repo scoping)", async () => {
    const loaded = await svc.getQuote(ctxA, "company-a", "quote-other");
    assert.equal(loaded, null);
  });

  it("rejects cross-company context before hitting the repository", async () => {
    await assert.rejects(
      () => svc.getQuote(ctxA, "company-b", "quote-1"),
      (err: unknown) => err instanceof QuotePermissionError,
    );
  });

  it("rejects callers without quotes.view", async () => {
    const noView: QuoteServiceContext = {
      ...ctxA,
      hasPermission: () => false,
    };
    await assert.rejects(
      () => svc.getQuote(noView, "company-a", "quote-1"),
      (err: unknown) => err instanceof QuotePermissionError,
    );
  });
});
