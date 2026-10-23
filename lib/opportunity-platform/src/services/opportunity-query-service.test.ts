import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OpportunityRepository } from "../repositories/opportunity-repository-port.js";
import type { OpportunityRecord, OpportunityServiceContext } from "../types.js";
import { OpportunityQueryService } from "./opportunity-query-service.js";

function baseOpp(partial: Partial<OpportunityRecord> = {}): OpportunityRecord {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "opp-1",
    companyId: "co-1",
    pipelineId: "pipe-1",
    stageId: "stage-1",
    name: "Opp",
    leadId: "lead-1",
    customerId: "cust-1",
    primaryProductId: "prod-1",
    primaryContactName: "",
    ownerUserId: null,
    companyName: null,
    country: null,
    market: null,
    language: null,
    currency: "SAR",
    expectedRevenue: null,
    weightedRevenue: null,
    exchangeRate: null,
    regionalPricing: {},
    probabilityPercent: 10,
    probabilityConfidence: null,
    probabilitySource: "auto",
    probabilityReason: "",
    expectedCloseDate: null,
    createdFromLead: true,
    aiScoreSnapshot: null,
    aiContextSnapshot: {},
    currentQuoteId: null,
    metadata: {},
    wonAt: null,
    lostAt: null,
    lostReason: null,
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function leadSnapshot(lifecycleStatus: string) {
  return {
    id: "lead-1",
    title: "Lead",
    contactName: "A",
    companyName: null,
    email: null,
    customerId: "cust-1",
    assignedUserId: null,
    estimatedValue: null,
    currency: "SAR",
    expectedCloseDate: null,
    language: null,
    territory: null,
    isQualified: true,
    lifecycleStatus,
    score: 0,
    aiSummary: "",
    metadata: {},
  };
}

function repo(overrides: Partial<OpportunityRepository> = {}): OpportunityRepository {
  const base: OpportunityRepository = {
    ensureDefaultPipeline: async () => "pipe-1",
    getDefaultStage: async () => null,
    getStage: async () => null,
    listPipelines: async () => [],
    listStages: async () => [],
    createOpportunity: async () => {
      throw new Error("not used");
    },
    updateOpportunity: async () => {
      throw new Error("not used");
    },
    softDeleteOpportunity: async () => {},
    getOpportunity: async () => baseOpp(),
    listDemoVisibilityBlockedLeadIds: async () => [],
    listOpportunities: async () => ({ items: [], total: 0 }),
    findOpenByCustomerProduct: async () => null,
    getCatalogProductInCompany: async () => null,
    getCustomerInCompany: async () => null,
    addHistory: async () => ({}) as never,
    listHistory: async () => [],
    getLeadSnapshot: async () => leadSnapshot("demo_completed"),
    findCustomerByEmail: async () => ({ kind: "none" }),
    attachLeadToCustomer: async () => {},
  };
  return { ...base, ...overrides };
}

const ctx: OpportunityServiceContext = {
  userId: "u1",
  companyId: "co-1",
  isSuperAdmin: false,
  hasPermission: () => true,
};

describe("OpportunityQueryService demo visibility", () => {
  it("hides detail while linked lead is demo_scheduled", async () => {
    const service = new OpportunityQueryService({
      opportunities: repo({
        getLeadSnapshot: async () => leadSnapshot("demo_scheduled"),
      }),
    });
    assert.equal(await service.getById(ctx, "co-1", "opp-1"), null);
  });

  it("hides detail until the linked lead reaches the فرصة column", async () => {
    const service = new OpportunityQueryService({
      opportunities: repo({
        getLeadSnapshot: async () => leadSnapshot("qualified"),
      }),
    });
    assert.equal(await service.getById(ctx, "co-1", "opp-1"), null);
  });

  it("shows detail after demo_completed (Opportunity/فرصة stage)", async () => {
    const service = new OpportunityQueryService({ opportunities: repo() });
    const row = await service.getById(ctx, "co-1", "opp-1");
    assert.equal(row?.id, "opp-1");
  });

  it("hides opportunities that have no lead", async () => {
    const service = new OpportunityQueryService({
      opportunities: repo({
        getOpportunity: async () => baseOpp({ leadId: null }),
        getLeadSnapshot: async () => {
          throw new Error("must not load lead when the opportunity has none");
        },
      }),
    });
    assert.equal(await service.getById(ctx, "co-1", "opp-1"), null);
  });

  it("list and board pass applyDemoVisibilityGate", async () => {
    let listGate: boolean | undefined;
    let boardGate: boolean | undefined;
    const service = new OpportunityQueryService({
      opportunities: repo({
        listOpportunities: async (input) => {
          if (input.pipelineId) boardGate = input.applyDemoVisibilityGate;
          else listGate = input.applyDemoVisibilityGate;
          return { items: [baseOpp()], total: 1 };
        },
        listStages: async () => [],
      }),
    });
    await service.list(ctx, { companyId: "co-1" });
    await service.getPipelineBoard(ctx, "co-1", "pipe-1");
    assert.equal(listGate, true);
    assert.equal(boardGate, true);
  });
});
