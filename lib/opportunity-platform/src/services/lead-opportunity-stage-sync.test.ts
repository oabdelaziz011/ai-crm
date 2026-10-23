import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  CreateOpportunityInput,
  OpportunityRepository,
} from "../repositories/opportunity-repository-port.js";
import type { OpportunityRecord, OpportunityStageRecord } from "../types.js";
import {
  LEAD_LIFECYCLE_TO_OPPORTUNITY_STAGE_KEY,
  mapLeadLifecycleToOpportunityStageKey,
  syncOpportunityStageFromLeadLifecycle,
} from "./lead-opportunity-stage-sync.js";

const qualification: OpportunityStageRecord = {
  id: "stg-qual",
  companyId: "co-1",
  pipelineId: "pipe-1",
  name: "Qualification",
  slug: "qualification",
  stageKey: "qualification",
  sortOrder: 0,
  defaultProbabilityPercent: 10,
  isTerminal: false,
};

const discovery: OpportunityStageRecord = {
  ...qualification,
  id: "stg-disc",
  name: "Discovery",
  slug: "discovery",
  stageKey: "discovery",
  defaultProbabilityPercent: 25,
};

const proposal: OpportunityStageRecord = {
  ...qualification,
  id: "stg-prop",
  name: "Proposal",
  slug: "proposal",
  stageKey: "proposal",
  defaultProbabilityPercent: 45,
};

const won: OpportunityStageRecord = {
  ...qualification,
  id: "stg-won",
  name: "Won",
  slug: "won",
  stageKey: "won",
  defaultProbabilityPercent: 100,
  isTerminal: true,
};

const lost: OpportunityStageRecord = {
  ...qualification,
  id: "stg-lost",
  name: "Lost",
  slug: "lost",
  stageKey: "lost",
  defaultProbabilityPercent: 0,
  isTerminal: true,
};

function opp(partial: Partial<OpportunityRecord> & { stageId: string }): OpportunityRecord {
  const now = new Date().toISOString();
  return {
    id: "opp-1",
    companyId: "co-1",
    pipelineId: "pipe-1",
    stageId: partial.stageId,
    name: "Deal",
    leadId: "lead-1",
    customerId: "cust-1",
    primaryProductId: null,
    primaryContactName: "",
    ownerUserId: "user-1",
    companyName: null,
    country: null,
    market: null,
    language: null,
    currency: "USD",
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
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function repo(overrides: Partial<OpportunityRepository> = {}): OpportunityRepository {
  let current = opp({ stageId: qualification.id });
  const stages = [qualification, discovery, proposal, won, lost];
  const base: OpportunityRepository = {
    ensureDefaultPipeline: async () => "pipe-1",
    getDefaultStage: async () => qualification,
    getStage: async (_c, stageId) => stages.find((s) => s.id === stageId) ?? null,
    listPipelines: async () => [],
    listStages: async () => stages,
    createOpportunity: async (_input: CreateOpportunityInput) => current,
    updateOpportunity: async (input) => {
      current = {
        ...current,
        stageId: input.stageId ?? current.stageId,
        probabilityPercent: input.probabilityPercent ?? current.probabilityPercent,
        weightedRevenue: input.weightedRevenue ?? current.weightedRevenue,
        wonAt: input.wonAt ?? current.wonAt,
        lostAt: input.lostAt ?? current.lostAt,
        lostReason: input.lostReason ?? current.lostReason,
        updatedAt: new Date().toISOString(),
      };
      return current;
    },
    softDeleteOpportunity: async () => {},
    getOpportunity: async () => current,
    listOpportunities: async () => ({ items: [current], total: 1 }),
    findOpenByCustomerProduct: async () => null,
    listDemoVisibilityBlockedLeadIds: async () => [],
    getCatalogProductInCompany: async () => null,
    getCustomerInCompany: async () => ({ id: "cust-1", companyId: "co-1" }),
    addHistory: async () => ({}) as never,
    listHistory: async () => [],
    getLeadSnapshot: async () => null,
    findCustomerByEmail: async () => ({ kind: "none" }),
    attachLeadToCustomer: async () => {},
  };
  return { ...base, ...overrides };
}

const ctx = {
  userId: "user-1",
  companyId: "co-1",
  isSuperAdmin: true,
  hasPermission: () => true,
};

describe("mapLeadLifecycleToOpportunityStageKey", () => {
  it("documents the explicit mapping without inventing lost", () => {
    assert.equal(mapLeadLifecycleToOpportunityStageKey("qualified"), "qualification");
    assert.equal(mapLeadLifecycleToOpportunityStageKey("contacted"), "discovery");
    assert.equal(mapLeadLifecycleToOpportunityStageKey("demo_completed"), "discovery");
    assert.equal(mapLeadLifecycleToOpportunityStageKey("proposal_sent"), "proposal");
    assert.equal(mapLeadLifecycleToOpportunityStageKey("negotiation"), "negotiation");
    assert.equal(mapLeadLifecycleToOpportunityStageKey("won"), "won");
    assert.equal(mapLeadLifecycleToOpportunityStageKey("lost"), null);
    assert.equal(mapLeadLifecycleToOpportunityStageKey("converted"), null);
    assert.equal(LEAD_LIFECYCLE_TO_OPPORTUNITY_STAGE_KEY.lost, null);
  });
});

describe("syncOpportunityStageFromLeadLifecycle", () => {
  it("syncs mapped stages when the Opportunity transition is allowed", async () => {
    const opportunities = repo();
    const result = await syncOpportunityStageFromLeadLifecycle(
      { opportunities },
      ctx,
      { companyId: "co-1", leadId: "lead-1", toLifecycleStatus: "contacted" },
    );
    assert.equal(result.status, "synced");
    assert.equal(result.toStageKey, "discovery");
    assert.equal((await opportunities.getOpportunity("co-1", "opp-1"))?.stageId, discovery.id);
  });

  it("skips unmapped lead lifecycles without inventing a stage", async () => {
    const result = await syncOpportunityStageFromLeadLifecycle(
      { opportunities: repo() },
      ctx,
      { companyId: "co-1", leadId: "lead-1", toLifecycleStatus: "archived" },
    );
    assert.equal(result.status, "skipped_unmapped");
  });

  it("skips lost because Opportunity Lost requires a reason", async () => {
    const result = await syncOpportunityStageFromLeadLifecycle(
      { opportunities: repo() },
      ctx,
      { companyId: "co-1", leadId: "lead-1", toLifecycleStatus: "lost" },
    );
    assert.equal(result.status, "skipped_unmapped");
    assert.match(result.reason, /no Opportunity stage mapping/i);
  });

  it("does not overwrite Won/Lost opportunities", async () => {
    const closed = opp({
      stageId: won.id,
      wonAt: new Date().toISOString(),
    });
    const opportunities = repo({
      listOpportunities: async () => ({ items: [closed], total: 1 }),
      getOpportunity: async () => closed,
      updateOpportunity: async () => {
        throw new Error("must not update terminal opportunity");
      },
    });
    const result = await syncOpportunityStageFromLeadLifecycle(
      { opportunities },
      ctx,
      { companyId: "co-1", leadId: "lead-1", toLifecycleStatus: "negotiation" },
    );
    assert.equal(result.status, "skipped_terminal");
  });

  it("skips when the Opportunity transition matrix forbids the hop", async () => {
    // qualification → won is not allowed directly.
    const result = await syncOpportunityStageFromLeadLifecycle(
      { opportunities: repo() },
      ctx,
      { companyId: "co-1", leadId: "lead-1", toLifecycleStatus: "won" },
    );
    assert.equal(result.status, "skipped_transition_not_allowed");
  });

  it("skips when no opportunity is linked", async () => {
    const opportunities = repo({
      listOpportunities: async () => ({ items: [], total: 0 }),
    });
    const result = await syncOpportunityStageFromLeadLifecycle(
      { opportunities },
      ctx,
      { companyId: "co-1", leadId: "lead-1", toLifecycleStatus: "contacted" },
    );
    assert.equal(result.status, "skipped_no_opportunity");
  });
});
