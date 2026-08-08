import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeWeightedRevenue, toOpportunity } from "../types.js";
import { OPPORTUNITY_PERMISSIONS, OPPORTUNITY_STAGE_KEYS } from "../constants.js";

describe("opportunity-platform foundation", () => {
  it("exposes required permissions", () => {
    assert.equal(OPPORTUNITY_PERMISSIONS.view, "opportunities.view");
    assert.equal(OPPORTUNITY_PERMISSIONS.convert, "opportunities.convert");
  });

  it("defines dynamic stage keys", () => {
    assert.deepEqual([...OPPORTUNITY_STAGE_KEYS], [
      "qualification",
      "discovery",
      "proposal",
      "negotiation",
      "contract",
      "won",
      "lost",
    ]);
  });

  it("computes weighted revenue", () => {
    assert.equal(computeWeightedRevenue(10000, 25), 2500);
    assert.equal(computeWeightedRevenue(null, 50), null);
  });

  it("maps opportunity record to CRM shape", () => {
    const now = new Date().toISOString();
    const opp = toOpportunity(
      {
        id: "o1",
        companyId: "c1",
        pipelineId: "p1",
        stageId: "s1",
        name: "Acme Deal",
        leadId: "l1",
        customerId: null,
        primaryContactName: "Ada",
        ownerUserId: "u1",
        companyName: "Acme",
        country: "SA",
        market: "Enterprise",
        language: "ar",
        currency: "USD",
        expectedRevenue: 10000,
        weightedRevenue: 2500,
        exchangeRate: null,
        regionalPricing: {},
        probabilityPercent: 25,
        probabilityConfidence: null,
        probabilitySource: "manual",
        probabilityReason: "stage",
        expectedCloseDate: null,
        createdFromLead: true,
        aiScoreSnapshot: 72,
        aiContextSnapshot: {},
        currentQuoteId: null,
        metadata: {},
        wonAt: null,
        lostAt: null,
        lostReason: null,
        createdBy: "u1",
        updatedBy: "u1",
        createdAt: now,
        updatedAt: now,
      },
      { stage: "Discovery", stageKey: "discovery", owner: "Ada Lovelace" },
    );
    assert.equal(opp.name, "Acme Deal");
    assert.equal(opp.stageKey, "discovery");
    assert.equal(opp.createdFromLead, true);
  });
});
