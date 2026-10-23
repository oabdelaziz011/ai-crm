import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLeadsCrmMetrics, LEADS_CRM_METRIC_LIFECYCLE } from "./leads-crm-metrics.js";

describe("buildLeadsCrmMetrics", () => {
  it("exposes demo_scheduled without double-counting into proposal", () => {
    const metrics = buildLeadsCrmMetrics(
      {
        new: 2,
        qualified: 3,
        demo_scheduled: 4,
        proposal_sent: 5,
        negotiation: 7,
        won: 1,
        converted: 2,
        lost: 1,
      },
      25,
    );

    const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));
    assert.equal(byId.demo?.count, 4);
    assert.equal(byId.demo?.lifecycleStatus, "demo_scheduled");
    assert.equal(byId.proposal?.count, 5, "negotiation must not inflate proposal");
    assert.equal(byId.negotiation?.count, 7);
    assert.equal(LEADS_CRM_METRIC_LIFECYCLE.demo, "demo_scheduled");
    assert.equal(LEADS_CRM_METRIC_LIFECYCLE.opportunity, "demo_completed");
    const ids = metrics.map((metric) => metric.id);
    assert.ok(ids.indexOf("proposal") < ids.indexOf("opportunity"));
    assert.equal(LEADS_CRM_METRIC_LIFECYCLE.won, "won");
    assert.equal(LEADS_CRM_METRIC_LIFECYCLE.converted, "converted");
    assert.equal(byId.won?.count, 1);
    assert.equal(byId.converted?.count, 2);
  });
});
