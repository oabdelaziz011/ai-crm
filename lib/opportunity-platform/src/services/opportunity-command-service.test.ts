import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  CreateOpportunityInput,
  LeadCustomerEmailMatch,
  OpportunityRepository,
} from "../repositories/opportunity-repository-port.js";
import type {
  OpportunityHistoryRecord,
  OpportunityPipelineRecord,
  OpportunityRecord,
  OpportunityStageRecord,
} from "../types.js";
import {
  OpportunityCommandService,
  type OpportunityEventPublisherPort,
} from "./opportunity-command-service.js";
import { createSupabaseOpportunitySaleCompletion } from "../repositories/supabase-sale-completion.js";

const stage: OpportunityStageRecord = {
  id: "stage-1",
  companyId: "company-1",
  pipelineId: "pipe-1",
  name: "Qualification",
  slug: "qualification",
  stageKey: "qualification",
  sortOrder: 0,
  defaultProbabilityPercent: 25,
  isTerminal: false,
};

const discoveryStage: OpportunityStageRecord = {
  ...stage,
  id: "stage-discovery",
  name: "Discovery",
  slug: "discovery",
  stageKey: "discovery",
  defaultProbabilityPercent: 25,
};

const lostStage: OpportunityStageRecord = {
  ...stage,
  id: "stage-lost",
  name: "Lost",
  slug: "lost",
  stageKey: "lost",
  defaultProbabilityPercent: 0,
  isTerminal: true,
};

function createOpportunityRecord(input: CreateOpportunityInput): OpportunityRecord {
  const now = new Date().toISOString();
  return {
    id: "opp-1",
    companyId: input.companyId,
    pipelineId: input.pipelineId,
    stageId: input.stageId,
    name: input.name,
    leadId: input.leadId ?? null,
    customerId: input.customerId ?? null,
    primaryProductId: input.primaryProductId ?? null,
    primaryContactName: input.primaryContactName ?? "",
    ownerUserId: input.ownerUserId ?? null,
    companyName: input.companyName ?? null,
    country: input.country ?? null,
    market: input.market ?? null,
    language: input.language ?? null,
    currency: input.currency ?? "USD",
    expectedRevenue: input.expectedRevenue ?? null,
    weightedRevenue: input.weightedRevenue ?? null,
    exchangeRate: null,
    regionalPricing: {},
    probabilityPercent: input.probabilityPercent,
    probabilityConfidence: null,
    probabilitySource: input.probabilitySource ?? "manual",
    probabilityReason: input.probabilityReason ?? "",
    expectedCloseDate: input.expectedCloseDate ?? null,
    createdFromLead: Boolean(input.createdFromLead),
    aiScoreSnapshot: input.aiScoreSnapshot ?? null,
    aiContextSnapshot: input.aiContextSnapshot ?? {},
    currentQuoteId: null,
    metadata: input.metadata ?? {},
    wonAt: null,
    lostAt: null,
    lostReason: null,
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

function createRepository(overrides: Partial<OpportunityRepository> = {}): OpportunityRepository {
  let attachedCustomerId: string | null = null;
  let createdOpportunity: OpportunityRecord | null = null;

  const base: OpportunityRepository = {
    ensureDefaultPipeline: async () => "pipe-1",
    getDefaultStage: async () => stage,
    getStage: async () => stage,
    listPipelines: async () => [],
    listStages: async () => [stage],
    createOpportunity: async (input) => {
      createdOpportunity = createOpportunityRecord(input);
      return createdOpportunity;
    },
    updateOpportunity: async () => {
      throw new Error("not implemented");
    },
    softDeleteOpportunity: async () => {},
    getOpportunity: async () => createdOpportunity,
    listOpportunities: async () => ({ items: [], total: 0 }),
    findOpenByCustomerProduct: async () => null,
    listDemoVisibilityBlockedLeadIds: async () => [],
    getCatalogProductInCompany: async (_companyId, productId) =>
      productId
        ? { id: productId, companyId: "company-1", name: "Product" }
        : null,
    getCustomerInCompany: async (_companyId, customerId) =>
      customerId ? { id: customerId, companyId: "company-1" } : null,
    addHistory: async () => ({}) as OpportunityHistoryRecord,
    listHistory: async () => [],
    getLeadSnapshot: async () => ({
      id: "lead-1",
      title: "Acme Lead",
      contactName: "Jane Doe",
      companyName: "Acme",
      email: "jane@example.com",
      customerId: null,
      assignedUserId: "user-1",
      estimatedValue: 1000,
      currency: "SAR",
      expectedCloseDate: null,
      language: "ar",
      territory: "SA",
      isQualified: true,
      score: 70,
      aiSummary: "",
      metadata: {},
    }),
    findCustomerByEmail: async (_companyId, email): Promise<LeadCustomerEmailMatch> => {
      if (email.toLowerCase() === "jane@example.com") {
        return { kind: "found", customerId: "cust-existing" };
      }
      return { kind: "none" };
    },
    attachLeadToCustomer: async (_companyId, _leadId, customerId) => {
      attachedCustomerId = customerId;
    },
  };

  const repo = { ...base, ...overrides };
  return Object.assign(repo, {
    getAttachedCustomerId: () => attachedCustomerId,
    getCreatedOpportunity: () => createdOpportunity,
  }) as OpportunityRepository & {
    getAttachedCustomerId: () => string | null;
    getCreatedOpportunity: () => OpportunityRecord | null;
  };
}

const events: OpportunityEventPublisherPort = {
  async publishCreated() {},
  async publishStageChanged() {},
  async publishProbabilityChanged() {},
  async publishWon() {},
  async publishLost() {},
  async publishNegotiationStarted() {},
};

const ctx = {
  userId: "user-1",
  companyId: "company-1",
  isSuperAdmin: true,
  hasPermission: () => true,
};

describe("OpportunityCommandService.createFromLead", () => {
  it("reuses an existing customer by email and links the lead before creating the opportunity", async () => {
    const opportunities = createRepository();
    const service = new OpportunityCommandService({ opportunities, events });

    const result = await service.createFromLead(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
    });

    assert.equal(
      (opportunities as ReturnType<typeof createRepository>).getAttachedCustomerId(),
      "cust-existing",
    );
    assert.equal(result.opportunity.customerId, "cust-existing");
    assert.equal(result.opportunity.leadId, "lead-1");
  });

  it("reuses lead.customerId without creating a customer", async () => {
    const opportunities = createRepository({
      getLeadSnapshot: async () => ({
        id: "lead-1",
        title: "Acme Lead",
        contactName: "Jane Doe",
        companyName: "Acme",
        email: "jane@example.com",
        customerId: "cust-linked",
        assignedUserId: "user-1",
        estimatedValue: 1000,
        currency: "SAR",
        expectedCloseDate: null,
        language: "ar",
        territory: "SA",
        isQualified: true,
        score: 70,
        aiSummary: "",
        metadata: {},
      }),
      findCustomerByEmail: async () => {
        throw new Error("should not lookup when lead already has customerId");
      },
      attachLeadToCustomer: async () => {
        throw new Error("should not attach when lead already has customerId");
      },
    });
    const service = new OpportunityCommandService({ opportunities, events });

    const result = await service.createFromLead(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
    });

    assert.equal(result.opportunity.customerId, "cust-linked");
  });

  it("does not insert duplicate customers when email already exists", async () => {
    const opportunities = createRepository();
    const service = new OpportunityCommandService({ opportunities, events });

    await service.createFromLead(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
    });

    assert.equal(
      (opportunities as ReturnType<typeof createRepository>).getCreatedOpportunity()?.customerId,
      "cust-existing",
    );
  });

  it("returns an existing opportunity for the lead instead of failing", async () => {
    const existing = createOpportunityRecord({
      companyId: "company-1",
      pipelineId: "pipe-1",
      stageId: "stage-1",
      name: "Existing Opp",
      leadId: "lead-1",
      customerId: "cust-linked",
      probabilityPercent: 25,
    });
    const opportunities = createRepository({
      getLeadSnapshot: async () => ({
        id: "lead-1",
        title: "Acme Lead",
        contactName: "Jane Doe",
        companyName: "Acme",
        email: "jane@example.com",
        customerId: "cust-linked",
        assignedUserId: "user-1",
        estimatedValue: 1000,
        currency: "SAR",
        expectedCloseDate: null,
        language: "ar",
        territory: "SA",
        isQualified: true,
        score: 70,
        aiSummary: "",
        metadata: {},
      }),
      listOpportunities: async () => ({ items: [existing], total: 1 }),
    });
    const service = new OpportunityCommandService({ opportunities, events });

    const result = await service.createFromLead(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
    });

    assert.equal(result.opportunity.id, existing.id);
    assert.equal(
      (opportunities as ReturnType<typeof createRepository>).getCreatedOpportunity(),
      null,
    );
  });

  it("uses company billing default when lead currency is legacy USD", async () => {
    const opportunities = createRepository({
      getLeadSnapshot: async () => ({
        id: "lead-1",
        title: "Acme Lead",
        contactName: "Jane Doe",
        companyName: "Acme",
        email: "jane@example.com",
        customerId: "cust-linked",
        assignedUserId: "user-1",
        estimatedValue: 1000,
        currency: "USD",
        expectedCloseDate: null,
        language: "ar",
        territory: "SA",
        isQualified: true,
        score: 70,
        aiSummary: "",
        metadata: {},
      }),
    });
    const service = new OpportunityCommandService({ opportunities, events });

    const result = await service.createFromLead(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      companyDefaultCurrency: "EGP",
    });

    assert.equal(result.opportunity.currency, "EGP");
  });
});

describe("OpportunityCommandService.createManual", () => {
  it("seeds currency from company billing default when omitted", async () => {
    const opportunities = createRepository();
    const service = new OpportunityCommandService({ opportunities, events });

    const result = await service.createManual(ctx, {
      companyId: "company-1",
      name: "Manual Opp",
      companyDefaultCurrency: "EGP",
    });

    assert.equal(result.opportunity.currency, "EGP");
    assert.equal(
      (opportunities as ReturnType<typeof createRepository>).getCreatedOpportunity()?.currency,
      "EGP",
    );
  });

  it("allows intentional unscoped manual create and stamps identityScope", async () => {
    const opportunities = createRepository();
    const service = new OpportunityCommandService({ opportunities, events });
    const result = await service.createManual(ctx, {
      companyId: "company-1",
      name: "Unscoped Manual",
      companyDefaultCurrency: "EGP",
    });
    assert.equal(result.opportunity.customerId, null);
    assert.equal(result.opportunity.primaryProductId, null);
    assert.equal(result.opportunity.metadata.identityScope, "unscoped_manual");
  });

  it("rejects primaryProductId without customerId", async () => {
    const opportunities = createRepository();
    const service = new OpportunityCommandService({ opportunities, events });
    await assert.rejects(
      () =>
        service.createManual(ctx, {
          companyId: "company-1",
          name: "Half scoped",
          primaryProductId: "prod-x",
        }),
      (error: unknown) =>
        error instanceof Error &&
        /primaryProductId requires a resolved customerId/i.test(error.message) &&
        (error as { reason?: string }).reason === "product_requires_customer",
    );
  });

  it("rejects cross-company customerId", async () => {
    const opportunities = createRepository({
      getCustomerInCompany: async () => null,
    });
    const service = new OpportunityCommandService({ opportunities, events });
    await assert.rejects(
      () =>
        service.createManual(ctx, {
          companyId: "company-1",
          name: "Foreign cust",
          customerId: "cust-foreign",
        }),
      /customer in this company/,
    );
  });

  it("rejects cross-company primaryProductId even when customer is present", async () => {
    const opportunities = createRepository({
      getCatalogProductInCompany: async () => null,
    });
    const service = new OpportunityCommandService({ opportunities, events });
    await assert.rejects(
      () =>
        service.createManual(ctx, {
          companyId: "company-1",
          name: "Foreign product",
          customerId: "cust-1",
          primaryProductId: "prod-foreign",
        }),
      /active catalog product in this company/,
    );
  });
});

describe("OpportunityCommandService identity gates", () => {
  it("rejects createFromLead when customer identity cannot be resolved", async () => {
    const opportunities = createRepository({
      getLeadSnapshot: async () => ({
        id: "lead-1",
        title: "No Identity",
        contactName: "Pat",
        companyName: "Acme",
        email: null,
        customerId: null,
        assignedUserId: "user-1",
        estimatedValue: null,
        currency: "USD",
        expectedCloseDate: null,
        language: "en",
        territory: null,
        isQualified: true,
        score: 10,
        aiSummary: "",
        metadata: {},
      }),
      findCustomerByEmail: async () => ({ kind: "none" }),
    });
    const service = new OpportunityCommandService({ opportunities, events });
    await assert.rejects(
      () =>
        service.createFromLead(ctx, {
          companyId: "company-1",
          leadId: "lead-1",
        }),
      (error: unknown) =>
        error instanceof Error &&
        /customer identity is required/i.test(error.message) &&
        (error as { reason?: string }).reason === "customer_identity_required",
    );
    assert.equal(
      (opportunities as ReturnType<typeof createRepository>).getCreatedOpportunity(),
      null,
    );
  });

  it("stamps general_deal when customer is resolved but product is omitted", async () => {
    const opportunities = createRepository({
      getLeadSnapshot: async () => ({
        id: "lead-1",
        title: "General Deal",
        contactName: "Jane",
        companyName: "Acme",
        email: "jane@example.com",
        customerId: "cust-1",
        assignedUserId: "user-1",
        estimatedValue: 100,
        currency: "USD",
        expectedCloseDate: null,
        language: "en",
        territory: null,
        isQualified: true,
        score: 40,
        aiSummary: "",
        metadata: {},
      }),
    });
    const service = new OpportunityCommandService({ opportunities, events });
    const result = await service.createFromLead(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
    });
    assert.equal(result.opportunity.customerId, "cust-1");
    assert.equal(result.opportunity.primaryProductId, null);
    assert.equal(result.opportunity.metadata.identityScope, "general_deal");
  });

  it("rejects lead.customerId that is not in the company", async () => {
    const opportunities = createRepository({
      getCustomerInCompany: async () => null,
      getLeadSnapshot: async () => ({
        id: "lead-1",
        title: "Cross",
        contactName: "Jane",
        companyName: "Acme",
        email: null,
        customerId: "cust-foreign",
        assignedUserId: "user-1",
        estimatedValue: null,
        currency: "USD",
        expectedCloseDate: null,
        language: "en",
        territory: null,
        isQualified: true,
        score: 10,
        aiSummary: "",
        metadata: {},
      }),
    });
    const service = new OpportunityCommandService({ opportunities, events });
    await assert.rejects(
      () =>
        service.createFromLead(ctx, {
          companyId: "company-1",
          leadId: "lead-1",
          primaryProductId: "prod-x",
        }),
      /customer_id must reference a customer in this company/,
    );
  });
});

describe("OpportunityCommandService.changeStage", () => {
  it("rejects Lost without a reason and accepts Lost with a reason", async () => {
    const existing = createOpportunityRecord({
      companyId: "company-1",
      pipelineId: "pipe-1",
      stageId: stage.id,
      name: "Scoped Opp",
      probabilityPercent: 25,
      createdBy: "user-1",
    });
    let updated: OpportunityRecord | null = null;
    const opportunities = createRepository({
      getOpportunity: async () => existing,
      getStage: async (_companyId, stageId) => {
        if (stageId === stage.id) return stage;
        if (stageId === lostStage.id) return lostStage;
        if (stageId === discoveryStage.id) return discoveryStage;
        return null;
      },
      updateOpportunity: async (input) => {
        updated = {
          ...existing,
          stageId: input.stageId ?? existing.stageId,
          lostAt: input.lostAt ?? null,
          lostReason: input.lostReason ?? null,
          probabilityPercent: input.probabilityPercent ?? existing.probabilityPercent,
          weightedRevenue: input.weightedRevenue ?? existing.weightedRevenue,
          updatedAt: new Date().toISOString(),
        };
        return updated;
      },
    });
    const service = new OpportunityCommandService({ opportunities, events });

    await assert.rejects(
      () =>
        service.changeStage(ctx, {
          companyId: "company-1",
          opportunityId: existing.id,
          stageId: lostStage.id,
        }),
      /loss reason/i,
    );

    const result = await service.changeStage(ctx, {
      companyId: "company-1",
      opportunityId: existing.id,
      stageId: lostStage.id,
      lostReason: "Budget cut",
    });
    assert.equal(result.opportunity.lostReason, "Budget cut");
    assert.ok(result.opportunity.lostAt);
  });

  it("rejects Won without an accepted quote on every caller", async () => {
    const negotiation: OpportunityStageRecord = {
      ...stage,
      id: "stage-negotiation",
      name: "Negotiation",
      slug: "negotiation",
      stageKey: "negotiation",
      defaultProbabilityPercent: 70,
    };
    const wonStage: OpportunityStageRecord = {
      ...stage,
      id: "stage-won",
      name: "Won",
      slug: "won",
      stageKey: "won",
      defaultProbabilityPercent: 100,
      isTerminal: true,
    };
    const existing = createOpportunityRecord({
      companyId: "company-1",
      pipelineId: "pipe-1",
      stageId: negotiation.id,
      name: "Negotiating",
      probabilityPercent: 70,
      createdBy: "user-1",
    });
    const opportunities = createRepository({
      getOpportunity: async () => existing,
      getStage: async (_companyId, stageId) => {
        if (stageId === negotiation.id) return negotiation;
        if (stageId === wonStage.id) return wonStage;
        return null;
      },
      updateOpportunity: async (input) => ({
        ...existing,
        stageId: input.stageId ?? existing.stageId,
        wonAt: input.wonAt ?? null,
        updatedAt: new Date().toISOString(),
      }),
    });
    const denied = new OpportunityCommandService({ opportunities, events });
    await assert.rejects(
      () =>
        denied.changeStage(ctx, {
          companyId: "company-1",
          opportunityId: existing.id,
          stageId: wonStage.id,
        }),
      (error: unknown) =>
        error instanceof Error && "reason" in error && error.reason === "sale_completion_required",
    );
    const allowed = new OpportunityCommandService({
      opportunities,
      events,
      saleCompletion: { async hasAcceptedQuoteForOpportunity() { return true; } },
    });
    const result = await allowed.changeStage(ctx, {
      companyId: "company-1",
      opportunityId: existing.id,
      stageId: wonStage.id,
    });
    assert.equal(result.opportunity.stageId, wonStage.id);
    assert.ok(result.opportunity.wonAt);
  });

  it("accepts Won only when the quote query finds an accepted quote with accepted_at", async () => {
    type QuoteRow = {
      id: string;
      company_id: string;
      opportunity_id: string;
      status: string;
      accepted_at: string | null;
      deleted_at: string | null;
    };
    const quotes: QuoteRow[] = [
      {
        id: "quote-draft",
        company_id: "company-1",
        opportunity_id: "opp-won",
        status: "draft",
        accepted_at: null,
        deleted_at: null,
      },
      {
        id: "quote-accepted-unset",
        company_id: "company-1",
        opportunity_id: "opp-won",
        status: "accepted",
        accepted_at: null,
        deleted_at: null,
      },
    ];
    function quoteClient() {
      return {
        from() {
          const filters: Array<(row: QuoteRow) => boolean> = [];
          const chain = {
            select() {
              return chain;
            },
            eq(column: keyof QuoteRow, value: unknown) {
              filters.push((row) => row[column] === value);
              return chain;
            },
            not(column: keyof QuoteRow, op: string, value: unknown) {
              filters.push((row) => (op === "is" ? row[column] !== value : true));
              return chain;
            },
            is(column: keyof QuoteRow, value: unknown) {
              filters.push((row) => row[column] === value);
              return chain;
            },
            async limit() {
              const matched = quotes.filter((row) => filters.every((check) => check(row)));
              return { data: matched.slice(0, 1), error: null };
            },
          };
          return chain;
        },
      };
    }
    const negotiation: OpportunityStageRecord = {
      ...stage,
      id: "stage-negotiation",
      name: "Negotiation",
      slug: "negotiation",
      stageKey: "negotiation",
      defaultProbabilityPercent: 70,
    };
    const wonStage: OpportunityStageRecord = {
      ...stage,
      id: "stage-won",
      name: "Won",
      slug: "won",
      stageKey: "won",
      defaultProbabilityPercent: 100,
      isTerminal: true,
    };
    const existing = createOpportunityRecord({
      companyId: "company-1",
      pipelineId: "pipe-1",
      stageId: negotiation.id,
      name: "Negotiating",
      probabilityPercent: 70,
      createdBy: "user-1",
    });
    existing.id = "opp-won";
    const opportunities = createRepository({
      getOpportunity: async () => existing,
      getStage: async (_companyId, stageId) => {
        if (stageId === negotiation.id) return negotiation;
        if (stageId === wonStage.id) return wonStage;
        return null;
      },
      updateOpportunity: async (input) => ({
        ...existing,
        stageId: input.stageId ?? existing.stageId,
        wonAt: input.wonAt ?? null,
        updatedAt: new Date().toISOString(),
      }),
    });
    const service = new OpportunityCommandService({
      opportunities,
      events,
      saleCompletion: createSupabaseOpportunitySaleCompletion(quoteClient() as never),
    });
    await assert.rejects(
      () =>
        service.changeStage(ctx, {
          companyId: "company-1",
          opportunityId: existing.id,
          stageId: wonStage.id,
        }),
      (error: unknown) =>
        error instanceof Error && "reason" in error && error.reason === "sale_completion_required",
    );
    quotes.push({
      id: "quote-accepted",
      company_id: "company-1",
      opportunity_id: "opp-won",
      status: "accepted",
      accepted_at: "2026-10-22T08:00:00.000Z",
      deleted_at: null,
    });
    const won = await service.changeStage(ctx, {
      companyId: "company-1",
      opportunityId: existing.id,
      stageId: wonStage.id,
    });
    assert.equal(won.opportunity.stageId, wonStage.id);
    assert.ok(won.opportunity.wonAt);
  });

  it("reuses open opportunity by customer + primary product", async () => {
    const existing = createOpportunityRecord({
      companyId: "company-1",
      pipelineId: "pipe-1",
      stageId: stage.id,
      name: "Product X Opp",
      leadId: "lead-other",
      customerId: "cust-1",
      primaryProductId: "prod-x",
      probabilityPercent: 25,
      createdBy: "user-1",
    });
    const opportunities = createRepository({
      findOpenByCustomerProduct: async () => existing,
      getLeadSnapshot: async () => ({
        id: "lead-2",
        title: "Other Lead",
        contactName: "Pat",
        companyName: "Acme",
        email: "pat@example.com",
        customerId: "cust-1",
        assignedUserId: "user-1",
        estimatedValue: 500,
        currency: "USD",
        expectedCloseDate: null,
        language: "en",
        territory: null,
        isQualified: true,
        score: 50,
        aiSummary: "",
        metadata: {},
      }),
    });
    const service = new OpportunityCommandService({ opportunities, events });
    const result = await service.createFromLead(ctx, {
      companyId: "company-1",
      leadId: "lead-2",
      primaryProductId: "prod-x",
    });
    assert.equal(result.opportunity.id, existing.id);
    assert.equal(
      (opportunities as ReturnType<typeof createRepository>).getCreatedOpportunity(),
      null,
    );
  });

  it("rejects stage changes on already Won/Lost opportunities", async () => {
    const closed = createOpportunityRecord({
      companyId: "company-1",
      pipelineId: "pipe-1",
      stageId: lostStage.id,
      name: "Closed",
      probabilityPercent: 0,
      createdBy: "user-1",
    });
    closed.lostAt = new Date().toISOString();
    closed.lostReason = "Prior loss";
    const opportunities = createRepository({
      getOpportunity: async () => closed,
      getStage: async (_c, stageId) => {
        if (stageId === lostStage.id) return lostStage;
        if (stageId === discoveryStage.id) return discoveryStage;
        return stage;
      },
    });
    const service = new OpportunityCommandService({ opportunities, events });
    await assert.rejects(
      () =>
        service.changeStage(ctx, {
          companyId: "company-1",
          opportunityId: closed.id,
          stageId: discoveryStage.id,
        }),
      /Closed \(Won\/Lost\)/,
    );
  });

  it("fails safely on ambiguous customer email matches", async () => {
    const opportunities = createRepository({
      findCustomerByEmail: async () => ({ kind: "duplicate", count: 2 }),
      getLeadSnapshot: async () => ({
        id: "lead-1",
        title: "Acme Lead",
        contactName: "Jane",
        companyName: "Acme",
        email: "shared@example.com",
        customerId: null,
        assignedUserId: "user-1",
        estimatedValue: 1000,
        currency: "USD",
        expectedCloseDate: null,
        language: "en",
        territory: null,
        isQualified: true,
        score: 70,
        aiSummary: "",
        metadata: {},
      }),
    });
    const service = new OpportunityCommandService({ opportunities, events });
    await assert.rejects(
      () =>
        service.createFromLead(ctx, {
          companyId: "company-1",
          leadId: "lead-1",
          primaryProductId: "prod-x",
        }),
      /Multiple customers share this email/,
    );
  });

  it("rejects primaryProductId that is not in the company catalog", async () => {
    const opportunities = createRepository({
      getCatalogProductInCompany: async () => null,
      getLeadSnapshot: async () => ({
        id: "lead-1",
        title: "Acme Lead",
        contactName: "Jane",
        companyName: "Acme",
        email: "jane@example.com",
        customerId: "cust-1",
        assignedUserId: "user-1",
        estimatedValue: 1000,
        currency: "USD",
        expectedCloseDate: null,
        language: "en",
        territory: null,
        isQualified: true,
        score: 70,
        aiSummary: "",
        metadata: {},
      }),
    });
    const service = new OpportunityCommandService({ opportunities, events });
    await assert.rejects(
      () =>
        service.createFromLead(ctx, {
          companyId: "company-1",
          leadId: "lead-1",
          primaryProductId: "foreign-prod",
        }),
      /active catalog product in this company/,
    );
  });

  it("reclaims matching open opportunity after customer+product unique violation", async () => {
    const winner = createOpportunityRecord({
      companyId: "company-1",
      pipelineId: "pipe-1",
      stageId: stage.id,
      name: "Winner",
      leadId: "lead-1",
      customerId: "cust-1",
      primaryProductId: "prod-x",
      probabilityPercent: 25,
      createdBy: "user-1",
    });
    const opportunities = createRepository({
      createOpportunity: async () => {
        const err = Object.assign(new Error("duplicate key opportunities_one_open_per_customer_product_idx"), {
          code: "23505",
        });
        throw err;
      },
      findOpenByCustomerProduct: async () => winner,
      getLeadSnapshot: async () => ({
        id: "lead-1",
        title: "Acme Lead",
        contactName: "Jane",
        companyName: "Acme",
        email: "jane@example.com",
        customerId: "cust-1",
        assignedUserId: "user-1",
        estimatedValue: 1000,
        currency: "USD",
        expectedCloseDate: null,
        language: "en",
        territory: null,
        isQualified: true,
        score: 70,
        aiSummary: "",
        metadata: {},
      }),
    });
    const service = new OpportunityCommandService({ opportunities, events });
    const result = await service.createFromLead(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      primaryProductId: "prod-x",
      forceCreate: true,
    });
    assert.equal(result.opportunity.id, winner.id);
  });
});
