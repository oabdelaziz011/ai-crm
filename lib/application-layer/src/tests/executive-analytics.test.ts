import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApplicationLayerRegistry } from "@workspace/application-layer";
import { generateExecutiveInsights } from "@workspace/application-layer";

describe("Executive analytics — application layer", () => {
  it("returns live executive dashboard projection via analytics port", async () => {
    const registry = createApplicationLayerRegistry({ useMockPorts: true });
    const services = registry.getServices();
    const context = {
      tenantId: "tenant_1",
      actorId: "user_1",
      permissions: ["*"] as readonly string[],
      locale: "en",
      correlationId: "corr-1",
    };

    const result = await services.dashboard.getDashboard({ period: "today", comparePrevious: true }, context);
    assert.ok(result.data.kpis.length > 0);
    assert.ok(result.data.charts["finance.revenue"]?.length);
  });

  it("generates executive insights from analytics snapshot", async () => {
    const registry = createApplicationLayerRegistry({ useMockPorts: true });
    const services = registry.getServices();
    const context = {
      tenantId: "tenant_1",
      actorId: "user_1",
      permissions: ["*"] as readonly string[],
      locale: "en",
      correlationId: "corr-2",
    };

    const insights = await services.executiveInsights.getInsights({ period: "today" }, context);
    assert.ok(insights.data.insights.length >= 0);
    assert.ok(["excellent", "good", "fair", "at_risk", "critical"].includes(insights.data.summary.health));
  });

  it("executive insights engine detects revenue momentum", () => {
    const snapshot = {
      capturedAt: new Date().toISOString(),
      currency: "USD",
      kpis: [
        { key: "finance.revenue.today", label: "Today", value: 500_000, previousValue: 400_000, unit: "currency" as const, trend: "up" as const },
      ],
      charts: {},
      rankings: { customers: [], employees: [], services: [], branches: [] },
      breakdowns: { revenueByBranch: [], revenueByEmployee: [], revenueByService: [], paymentMethods: [] },
    };
    const result = generateExecutiveInsights(snapshot);
    assert.ok(result.insights.some((i) => i.title.includes("Revenue")));
  });
});
