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

const stage: OpportunityStageRecord = {
  id: "stage-1",
  companyId: "company-1",
  pipelineId: "pipe-1",
  name: "Qualification",
  slug: "qualification",
  stageKey: "qualification",
  sortOrder: 0,
  defaultProbabilityPercent: 25,
  isClosedWon: false,
  isClosedLost: false,
  isActive: true,
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
});
