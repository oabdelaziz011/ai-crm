import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DashboardEngine,
  DashboardMetricRegistry,
  DashboardPermissionDeniedError,
  DashboardTenantIsolationError,
  DASHBOARD_VIEW_PERMISSION,
  mergeProviderSnapshots,
  type DashboardAccess,
  type DashboardMetricProvider,
  type DashboardProviderSnapshot,
} from "./index.js";

function createAccess(overrides?: Partial<DashboardAccess>): DashboardAccess {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => code === DASHBOARD_VIEW_PERMISSION || code === "customers.view",
    ...overrides,
  };
}

function metric(key: string, category: string, value: number) {
  return {
    key,
    category,
    label: key,
    value,
    capturedAt: "2026-07-31T10:00:00.000Z",
  };
}

function createProvider(
  providerId: string,
  category: string,
  metrics: DashboardProviderSnapshot["metrics"],
  options?: Partial<DashboardMetricProvider>,
): DashboardMetricProvider {
  return {
    providerId,
    category,
    requiredPermissions: options?.requiredPermissions,
    collect: async (_access, input) => ({
      providerId,
      category,
      companyId: input.companyId,
      capturedAt: new Date().toISOString(),
      metrics,
    }),
  };
}

describe("DashboardMetricRegistry", () => {
  it("registers providers without modifying the engine", () => {
    const registry = new DashboardMetricRegistry();
    registry.registerProvider(createProvider("crm", "crm", []));
    assert.equal(registry.listProviders().length, 1);
  });

  it("filters providers by category and id for lazy execution", () => {
    const registry = new DashboardMetricRegistry();
    registry.registerProvider(createProvider("crm", "crm", []));
    registry.registerProvider(createProvider("finance", "finance", []));

    assert.equal(registry.listProvidersForQuery({ categories: ["crm"] }).length, 1);
    assert.equal(registry.listProvidersForQuery({ providerIds: ["finance"] }).length, 1);
  });

  it("supports extensible categories", () => {
    const registry = new DashboardMetricRegistry();
    registry.registerCategory("custom-analytics");
    registry.registerProvider(createProvider("custom", "custom-analytics", []));
    assert.deepEqual(registry.listCategories(), ["custom-analytics"]);
  });
});

describe("DashboardEngine", () => {
  it("executes providers in parallel and merges snapshots", async () => {
    const registry = new DashboardMetricRegistry();
    registry.registerProvider(createProvider("crm", "crm", [metric("customers.total", "crm", 42)]));
    registry.registerProvider(
      createProvider("support", "support", [metric("tickets.open", "support", 7)]),
    );

    const engine = new DashboardEngine({ registry });
    const snapshot = await engine.snapshot(createAccess(), {
      companyId: "company-1",
    });

    assert.equal(snapshot.metrics.length, 2);
    assert.equal(snapshot.providers.length, 2);
    assert.equal(snapshot.providers.every((provider) => provider.status === "success"), true);
  });

  it("isolates provider failures without failing the dashboard", async () => {
    const registry = new DashboardMetricRegistry();
    registry.registerProvider(createProvider("crm", "crm", [metric("customers.total", "crm", 10)]));
    registry.registerProvider({
      providerId: "broken",
      category: "finance",
      collect: async () => {
        throw new Error("finance provider unavailable");
      },
    });

    const engine = new DashboardEngine({ registry });
    const snapshot = await engine.snapshot(createAccess(), { companyId: "company-1" });

    assert.equal(snapshot.metrics.length, 1);
    assert.equal(snapshot.metrics[0]?.key, "customers.total");
    assert.equal(snapshot.providers.find((item) => item.providerId === "broken")?.status, "failed");
    assert.match(snapshot.warnings.join(" "), /finance provider unavailable/);
  });

  it("enforces tenant isolation", async () => {
    const registry = new DashboardMetricRegistry();
    registry.registerProvider(createProvider("crm", "crm", []));
    const engine = new DashboardEngine({ registry });

    await assert.rejects(
      () =>
        engine.snapshot(createAccess({ companyId: "company-2" }), {
          companyId: "company-1",
        }),
      DashboardTenantIsolationError,
    );
  });

  it("enforces dashboard RBAC", async () => {
    const registry = new DashboardMetricRegistry();
    registry.registerProvider(createProvider("crm", "crm", []));
    const engine = new DashboardEngine({ registry });

    await assert.rejects(
      () =>
        engine.snapshot(createAccess({ hasPermission: () => false }), {
          companyId: "company-1",
        }),
      DashboardPermissionDeniedError,
    );
  });

  it("skips providers when module permissions are missing", async () => {
    const registry = new DashboardMetricRegistry();
    registry.registerProvider(
      createProvider("crm", "crm", [metric("customers.total", "crm", 1)], {
        requiredPermissions: ["customers.view"],
      }),
    );
    registry.registerProvider(
      createProvider("finance", "finance", [metric("revenue.mrr", "finance", 2)], {
        requiredPermissions: ["finance.view"],
      }),
    );

    const engine = new DashboardEngine({ registry });
    const snapshot = await engine.snapshot(createAccess(), { companyId: "company-1" });

    assert.equal(snapshot.metrics.length, 1);
    assert.equal(snapshot.metrics[0]?.key, "customers.total");
  });

  it("lazy-loads only requested categories", async () => {
    const registry = new DashboardMetricRegistry();
    let financeCalls = 0;

    registry.registerProvider(createProvider("crm", "crm", [metric("customers.total", "crm", 3)]));
    registry.registerProvider({
      providerId: "finance",
      category: "finance",
      collect: async (_access, input) => {
        financeCalls += 1;
        return {
          providerId: "finance",
          category: "finance",
          companyId: input.companyId,
          capturedAt: new Date().toISOString(),
          metrics: [metric("revenue.mrr", "finance", 100)],
        };
      },
    });

    const engine = new DashboardEngine({ registry });
    const snapshot = await engine.snapshot(createAccess({ hasPermission: () => true }), {
      companyId: "company-1",
      filter: { categories: ["crm"] },
    });

    assert.equal(snapshot.metrics.length, 1);
    assert.equal(financeCalls, 0);
  });

  it("rejects provider metrics from another tenant", async () => {
    const registry = new DashboardMetricRegistry();
    registry.registerProvider({
      providerId: "crm",
      category: "crm",
      collect: async () => ({
        providerId: "crm",
        category: "crm",
        companyId: "company-2",
        capturedAt: new Date().toISOString(),
        metrics: [metric("customers.total", "crm", 99)],
      }),
    });

    const engine = new DashboardEngine({ registry });
    const snapshot = await engine.snapshot(createAccess({ hasPermission: () => true }), {
      companyId: "company-1",
    });

    assert.equal(snapshot.metrics.length, 0);
    assert.match(snapshot.warnings.join(" "), /tenant mismatch/i);
  });
});

describe("DashboardMetricAggregator", () => {
  it("deduplicates metrics by category and key", () => {
    const snapshot = mergeProviderSnapshots("company-1", [
      {
        providerId: "crm-a",
        category: "crm",
        status: "success",
        snapshot: {
          providerId: "crm-a",
          category: "crm",
          companyId: "company-1",
          capturedAt: "2026-07-31T10:00:00.000Z",
          metrics: [metric("customers.total", "crm", 1)],
        },
      },
      {
        providerId: "crm-b",
        category: "crm",
        status: "success",
        snapshot: {
          providerId: "crm-b",
          category: "crm",
          companyId: "company-1",
          capturedAt: "2026-07-31T10:00:00.000Z",
          metrics: [metric("customers.total", "crm", 2)],
        },
      },
    ]);

    assert.equal(snapshot.metrics.length, 1);
    assert.equal(snapshot.metrics[0]?.value, 2);
  });
});
