import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDraftQuoteFromVerifiedInterest,
  type QuoteDraftCommandDeps,
  type QuoteDraftExistingQuote,
  type QuoteDraftLeadContext,
  type QuoteDraftOpportunityContext,
} from "./quote-draft-from-interest.js";

const COMPANY = "company-a";
const USER = "user-1";
const CONV = "conv-1";
const LEAD = "lead-1";
const OPP = "opp-1";
const PRODUCT = "prod-1";

function lead(overrides: Partial<QuoteDraftLeadContext> = {}): QuoteDraftLeadContext {
  return {
    leadId: LEAD,
    isQualified: true,
    customerId: "cust-1",
    productInterest: { productId: PRODUCT, productName: "Clinic Pack" },
    ...overrides,
  };
}

function opportunity(
  overrides: Partial<QuoteDraftOpportunityContext> = {},
): QuoteDraftOpportunityContext {
  return {
    id: OPP,
    leadId: LEAD,
    currency: "EGP",
    country: "EG",
    market: null,
    name: "Clinic deal",
    customerId: "cust-1",
    primaryContactName: "Ada",
    isOpen: true,
    ...overrides,
  };
}

function draft(overrides: Partial<QuoteDraftExistingQuote> = {}): QuoteDraftExistingQuote {
  return {
    quoteId: "quote-1",
    quoteNumber: "Q-001",
    status: "draft",
    currency: "EGP",
    grandTotal: 499.9,
    lines: [{ productId: PRODUCT, unitPrice: 499.9, quantity: 1 }],
    ...overrides,
  };
}

function createDeps(overrides: Partial<QuoteDraftCommandDeps> = {}): QuoteDraftCommandDeps & {
  calls: { create: number; ensure: number };
} {
  const calls = { create: 0, ensure: 0 };
  const deps: QuoteDraftCommandDeps & { calls: { create: number; ensure: number } } = {
    calls,
    async loadLeadForConversation() {
      return lead();
    },
    async findOpenOpportunityForLead() {
      return opportunity();
    },
    async findCurrentDraftForOpportunity() {
      return null;
    },
    async previewCatalogPrice() {
      return { unitPrice: 499.9, currency: "EGP", source: "global" };
    },
    async createDraftFromOpportunity() {
      calls.create += 1;
      return {
        quoteId: "quote-new",
        quoteNumber: "Q-002",
        currency: "EGP",
        grandTotal: 0,
      };
    },
    async ensurePricedCatalogLine() {
      calls.ensure += 1;
      return {
        unitPrice: 499.9,
        currency: "EGP",
        grandTotal: 499.9,
        priceSource: "global",
      };
    },
    ...overrides,
  };
  return deps;
}

describe("createDraftQuoteFromVerifiedInterest", () => {
  it("creates a draft when lead interest, qualification, opportunity, and price are present", async () => {
    const deps = createDeps();
    const result = await createDraftQuoteFromVerifiedInterest(deps, {
      companyId: COMPANY,
      userId: USER,
      conversationId: CONV,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.created, true);
    assert.equal(result.alreadyExists, false);
    assert.equal(result.draftOnly, true);
    assert.equal(result.status, "draft");
    assert.equal(result.productId, PRODUCT);
    assert.equal(result.opportunityId, OPP);
    assert.equal(result.leadId, LEAD);
    assert.equal(result.priceSource, "global");
    assert.match(result.priceSourceNote, /not a confirmed regional/i);
    assert.match(result.message, /NOT sent/i);
    assert.equal(deps.calls.create, 1);
    assert.equal(deps.calls.ensure, 1);
  });

  it("returns alreadyExists without creating when a priced draft line exists", async () => {
    const deps = createDeps({
      async findCurrentDraftForOpportunity() {
        return draft();
      },
    });
    const result = await createDraftQuoteFromVerifiedInterest(deps, {
      companyId: COMPANY,
      userId: USER,
      conversationId: CONV,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.alreadyExists, true);
    assert.equal(result.created, false);
    assert.equal(result.quoteNumber, "Q-001");
    assert.equal(deps.calls.create, 0);
    assert.equal(deps.calls.ensure, 0);
  });

  it("asks for product interest when missing", async () => {
    const deps = createDeps({
      async loadLeadForConversation() {
        return lead({ productInterest: null });
      },
    });
    const result = await createDraftQuoteFromVerifiedInterest(deps, {
      companyId: COMPANY,
      userId: USER,
      conversationId: CONV,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, "needs_data");
    assert.ok(result.missing.includes("productInterest"));
    assert.ok(result.askCustomer);
  });

  it("asks when lead is not qualified", async () => {
    const deps = createDeps({
      async loadLeadForConversation() {
        return lead({ isQualified: false });
      },
    });
    const result = await createDraftQuoteFromVerifiedInterest(deps, {
      companyId: COMPANY,
      userId: USER,
      conversationId: CONV,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, "needs_data");
    assert.ok(result.missing.includes("lead_qualified"));
  });

  it("asks when no open opportunity exists", async () => {
    const deps = createDeps({
      async findOpenOpportunityForLead() {
        return null;
      },
    });
    const result = await createDraftQuoteFromVerifiedInterest(deps, {
      companyId: COMPANY,
      userId: USER,
      conversationId: CONV,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, "needs_data");
    assert.ok(result.missing.includes("opportunity"));
  });

  it("denies opportunity mismatch against the conversation lead", async () => {
    const deps = createDeps({
      async findOpenOpportunityForLead() {
        return opportunity({ leadId: "other-lead" });
      },
    });
    const result = await createDraftQuoteFromVerifiedInterest(deps, {
      companyId: COMPANY,
      userId: USER,
      conversationId: CONV,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, "denied");
    assert.equal(result.errorCode, "OPPORTUNITY_MISMATCH");
  });

  it("rejects a productId that does not match verified interest", async () => {
    const deps = createDeps();
    const result = await createDraftQuoteFromVerifiedInterest(deps, {
      companyId: COMPANY,
      userId: USER,
      conversationId: CONV,
      productId: "other-product",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, "needs_data");
    assert.ok(result.missing.includes("productId_match"));
    assert.equal(deps.calls.create, 0);
  });

  it("fails closed when catalog pricing is not listable", async () => {
    const deps = createDeps({
      async previewCatalogPrice() {
        return null;
      },
    });
    const result = await createDraftQuoteFromVerifiedInterest(deps, {
      companyId: COMPANY,
      userId: USER,
      conversationId: CONV,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "PRICING_FAILED");
    assert.equal(deps.calls.create, 0);
  });

  it("maps permission errors to denied", async () => {
    const deps = createDeps({
      async createDraftFromOpportunity() {
        throw new Error("Missing permission: quotes.create");
      },
    });
    const result = await createDraftQuoteFromVerifiedInterest(deps, {
      companyId: COMPANY,
      userId: USER,
      conversationId: CONV,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, "denied");
    assert.equal(result.errorCode, "PERMISSION_DENIED");
  });

  it("maps create failures without inventing success", async () => {
    const deps = createDeps({
      async createDraftFromOpportunity() {
        throw new Error("Opportunity not found.");
      },
    });
    const result = await createDraftQuoteFromVerifiedInterest(deps, {
      companyId: COMPANY,
      userId: USER,
      conversationId: CONV,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, "failed");
    assert.equal(result.ok, false);
  });

  it("records regional price source when preview reports regional", async () => {
    const deps = createDeps({
      async previewCatalogPrice() {
        return { unitPrice: 450, currency: "EGP", source: "regional" };
      },
      async ensurePricedCatalogLine() {
        return {
          unitPrice: 450,
          currency: "EGP",
          grandTotal: 450,
          priceSource: "regional",
        };
      },
    });
    const result = await createDraftQuoteFromVerifiedInterest(deps, {
      companyId: COMPANY,
      userId: USER,
      conversationId: CONV,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.priceSource, "regional");
    assert.match(result.priceSourceNote, /product_regional_prices/);
  });

  it("prices an existing unpriced draft line without creating a second quote", async () => {
    const deps = createDeps({
      async findCurrentDraftForOpportunity() {
        return draft({
          lines: [{ productId: PRODUCT, unitPrice: 0, quantity: 1 }],
          grandTotal: 0,
        });
      },
    });
    const result = await createDraftQuoteFromVerifiedInterest(deps, {
      companyId: COMPANY,
      userId: USER,
      conversationId: CONV,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.alreadyExists, true);
    assert.equal(deps.calls.create, 0);
    assert.equal(deps.calls.ensure, 1);
    assert.equal(result.currency, "EGP");
    assert.equal(result.unitPrice, 499.9);
  });

  it("keeps a USD catalog price on an EGP opportunity without converting it", async () => {
    const deps = createDeps({
      async findCurrentDraftForOpportunity() {
        return draft({
          currency: "EGP",
          grandTotal: 0,
          lines: [{ productId: PRODUCT, unitPrice: 0, quantity: 1 }],
        });
      },
      async previewCatalogPrice() {
        return { unitPrice: 1500, currency: "USD", source: "global" };
      },
      async ensurePricedCatalogLine() {
        return { unitPrice: 1500, currency: "USD", grandTotal: 1500, priceSource: "global" };
      },
    });
    const result = await createDraftQuoteFromVerifiedInterest(deps, {
      companyId: COMPANY,
      userId: USER,
      conversationId: CONV,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.draftOnly, true);
    assert.equal(result.currency, "USD");
    assert.equal(result.unitPrice, 1500);
    assert.equal(deps.calls.create, 0);
    assert.match(result.message, /NOT sent/i);
  });
});
