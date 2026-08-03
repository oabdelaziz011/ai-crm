import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  createApplicationLayerRegistry,
  createContext,
  Lead360Aggregator,
  createMockApplicationPorts,
} from "../index.js";

describe("Lead Platform — Lead360", () => {
  let ports: ReturnType<typeof createMockApplicationPorts>;

  beforeEach(() => {
    ports = createMockApplicationPorts();
  });

  it("aggregates Lead360 with universal entity sections", async () => {
    const aggregator = new Lead360Aggregator({ ports });
    const aggregate = await aggregator.aggregate({ leadId: "lead_1" }, createContext({
      tenantId: "tenant_1",
      actorId: "user_1",
      permissions: ["*"],
    }));

    assert.ok(aggregate);
    assert.equal(aggregate!.identity.leadId, "lead_1");
    assert.equal(aggregate!.profile.scoreBand, "hot");
    assert.ok(aggregate!.intelligence.nextBestAction);
  });
});

describe("Lead Platform — CQRS", () => {
  it("lists leads through LeadApplicationService", async () => {
    const registry = createApplicationLayerRegistry({ useMockPorts: true });
    const services = registry.getServices();
    const context = createContext({
      tenantId: "tenant_1",
      actorId: "user_admin",
      permissions: ["leads.view"],
    });

    const result = await services.lead.listLeads({}, context);
    assert.equal(result.data.total >= 1, true);
  });

  it("changes lead stage through command pipeline", async () => {
    const registry = createApplicationLayerRegistry({ useMockPorts: true });
    const services = registry.getServices();
    const context = createContext({
      tenantId: "tenant_1",
      actorId: "user_admin",
      permissions: ["leads.edit"],
    });

    const result = await services.lead.changeStage(
      { leadId: "lead_1", stageId: "stage_new" },
      context,
    );
    assert.equal(result.data.stageId, "stage_new");
  });

  it("converts lead through LeadApplicationService", async () => {
    const registry = createApplicationLayerRegistry({ useMockPorts: true });
    const services = registry.getServices();
    const context = createContext({
      tenantId: "tenant_1",
      actorId: "user_admin",
      permissions: ["leads.convert"],
    });

    const result = await services.lead.convertLead({ leadId: "lead_1" }, context);
    assert.ok(result.data.customerId);
  });
});
