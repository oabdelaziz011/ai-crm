import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DashboardEngine,
  DashboardMetricRegistry,
  DASHBOARD_VIEW_PERMISSION,
  DEFAULT_DASHBOARD_PROVIDER_IDS,
  registerDashboardProviders,
  createInMemoryDashboardMetricsPorts,
  demoDashboardMetricsSeed,
  CRM_VIEW_PERMISSION,
  SUPPORT_VIEW_PERMISSION,
  AI_VIEW_PERMISSION,
  AUTOMATION_VIEW_PERMISSION,
  KNOWLEDGE_VIEW_PERMISSION,
  CHANNELS_VIEW_PERMISSION,
  type DashboardAccess,
} from "../index.js";

function createAccess(permissions: string[]): DashboardAccess {
  const granted = new Set([DASHBOARD_VIEW_PERMISSION, ...permissions]);
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => granted.has(code),
  };
}

function createEngineWithDemoProviders(): DashboardEngine {
  const registry = new DashboardMetricRegistry();
  registerDashboardProviders(
    registry,
    createInMemoryDashboardMetricsPorts(demoDashboardMetricsSeed),
  );
  return new DashboardEngine({ registry });
}

describe("registerDashboardProviders", () => {
  it("registers all enterprise metric providers", () => {
    const registry = new DashboardMetricRegistry();
    registerDashboardProviders(registry, createInMemoryDashboardMetricsPorts());

    const providerIds = registry.listProviders().map((provider) => provider.providerId);
    assert.deepEqual(providerIds.sort(), [...DEFAULT_DASHBOARD_PROVIDER_IDS].sort());
  });
});

describe("Enterprise metric providers", () => {
  it("returns all module metrics when permissions are granted", async () => {
    const engine = createEngineWithDemoProviders();
    const snapshot = await engine.snapshot(
      createAccess([
        CRM_VIEW_PERMISSION,
        SUPPORT_VIEW_PERMISSION,
        AI_VIEW_PERMISSION,
        AUTOMATION_VIEW_PERMISSION,
        KNOWLEDGE_VIEW_PERMISSION,
        CHANNELS_VIEW_PERMISSION,
      ]),
      { companyId: "company-1" },
    );

    assert.equal(snapshot.providers.length, 6);
    assert.equal(snapshot.providers.every((provider) => provider.status === "success"), true);
    assert.equal(snapshot.metrics.length, 30);

    assert.equal(snapshot.metrics.find((metric) => metric.key === "crm.customers.total")?.value, 120);
    assert.equal(snapshot.metrics.find((metric) => metric.key === "support.tickets.open")?.value, 14);
    assert.equal(snapshot.metrics.find((metric) => metric.key === "ai.conversations")?.value, 320);
    assert.equal(snapshot.metrics.find((metric) => metric.key === "automation.runs")?.value, 210);
    assert.equal(snapshot.metrics.find((metric) => metric.key === "knowledge.searches")?.value, 890);
    assert.equal(snapshot.metrics.find((metric) => metric.key === "channels.whatsapp")?.value, 1540);
  });

  it("enforces provider-specific permissions independently from dashboard.view", async () => {
    const engine = createEngineWithDemoProviders();
    const snapshot = await engine.snapshot(createAccess([CRM_VIEW_PERMISSION, AI_VIEW_PERMISSION]), {
      companyId: "company-1",
    });

    assert.equal(snapshot.providers.length, 2);
    assert.equal(snapshot.metrics.length, 11);
    assert.ok(snapshot.metrics.some((metric) => metric.key === "crm.customers.total"));
    assert.ok(snapshot.metrics.some((metric) => metric.key === "ai.conversations"));
    assert.equal(snapshot.metrics.some((metric) => metric.key === "support.tickets.open"), false);
  });

  it("executes providers in parallel", async () => {
    const registry = new DashboardMetricRegistry();
    const delays: number[] = [];

    registerDashboardProviders(registry, {
      crm: {
        async fetchMetrics() {
          const started = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 20));
          delays.push(Date.now() - started);
          return demoDashboardMetricsSeed.crm!["company-1"]!;
        },
      },
      support: {
        async fetchMetrics() {
          const started = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 20));
          delays.push(Date.now() - started);
          return demoDashboardMetricsSeed.support!["company-1"]!;
        },
      },
      ai: {
        async fetchMetrics() {
          return demoDashboardMetricsSeed.ai!["company-1"]!;
        },
      },
      automation: {
        async fetchMetrics() {
          return demoDashboardMetricsSeed.automation!["company-1"]!;
        },
      },
      knowledge: {
        async fetchMetrics() {
          return demoDashboardMetricsSeed.knowledge!["company-1"]!;
        },
      },
      channels: {
        async fetchMetrics() {
          return demoDashboardMetricsSeed.channels!["company-1"]!;
        },
      },
    });

    const engine = new DashboardEngine({ registry });
    const startedAt = Date.now();
    await engine.snapshot(
      createAccess([
        CRM_VIEW_PERMISSION,
        SUPPORT_VIEW_PERMISSION,
        AI_VIEW_PERMISSION,
        AUTOMATION_VIEW_PERMISSION,
        KNOWLEDGE_VIEW_PERMISSION,
        CHANNELS_VIEW_PERMISSION,
      ]),
      { companyId: "company-1" },
    );
    const elapsed = Date.now() - startedAt;

    assert.ok(elapsed < 60, `expected parallel execution, took ${elapsed}ms`);
    assert.equal(delays.length, 2);
  });

  it("isolates provider port failures without failing the dashboard", async () => {
    const registry = new DashboardMetricRegistry();
    registerDashboardProviders(registry, {
      ...createInMemoryDashboardMetricsPorts(demoDashboardMetricsSeed),
      support: {
        async fetchMetrics() {
          throw new Error("support metrics unavailable");
        },
      },
    });

    const engine = new DashboardEngine({ registry });
    const snapshot = await engine.snapshot(
      createAccess([
        CRM_VIEW_PERMISSION,
        SUPPORT_VIEW_PERMISSION,
        AI_VIEW_PERMISSION,
        AUTOMATION_VIEW_PERMISSION,
        KNOWLEDGE_VIEW_PERMISSION,
        CHANNELS_VIEW_PERMISSION,
      ]),
      { companyId: "company-1" },
    );

    assert.equal(snapshot.providers.find((provider) => provider.providerId === "support")?.status, "failed");
    assert.match(snapshot.warnings.join(" "), /support metrics unavailable/);
    assert.equal(snapshot.metrics.length, 25);
  });

  it("lazy-loads requested categories only", async () => {
    const engine = createEngineWithDemoProviders();
    const snapshot = await engine.snapshot(
      createAccess([
        CRM_VIEW_PERMISSION,
        SUPPORT_VIEW_PERMISSION,
        AI_VIEW_PERMISSION,
        AUTOMATION_VIEW_PERMISSION,
        KNOWLEDGE_VIEW_PERMISSION,
        CHANNELS_VIEW_PERMISSION,
      ]),
      {
        companyId: "company-1",
        filter: { categories: ["crm", "ai"] },
      },
    );

    assert.equal(snapshot.providers.length, 2);
    assert.equal(snapshot.metrics.length, 11);
  });
});
