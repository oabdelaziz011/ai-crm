import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  DashboardRealtimeEngine,
  DashboardRefreshQueue,
  DashboardRefreshScheduler,
  InMemoryDashboardRealtimeEventPort,
  mergePartialDashboardSnapshot,
  computeReconnectDelay,
  type DashboardAccess,
  type DashboardSnapshot,
} from "../index.js";

const access: DashboardAccess = {
  userId: "user-1",
  companyId: "company-1",
  isSuperAdmin: false,
  hasPermission: (code) => code === "dashboard.view" || code === "crm.view",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildEvent(type: Parameters<InMemoryDashboardRealtimeEventPort["emit"]>[0]["type"]) {
  return {
    id: `${type}-${Math.random()}`,
    type,
    module: "crm" as const,
    companyId: "company-1",
    occurredAt: new Date().toISOString(),
  };
}

describe("DashboardRefreshQueue", () => {
  it("deduplicates identical events", () => {
    const queue = new DashboardRefreshQueue();
    queue.enqueue(buildEvent("customer_created"));
    queue.enqueue(buildEvent("customer_created"));
    assert.equal(queue.size("company-1"), 1);
  });

  it("batches different events for the same company", () => {
    const queue = new DashboardRefreshQueue();
    queue.enqueue(buildEvent("customer_created"));
    queue.enqueue(buildEvent("invoice_paid"));
    assert.equal(queue.size("company-1"), 2);
  });
});

describe("DashboardRefreshScheduler", () => {
  afterEach(() => {
    // no-op
  });

  it("debounces and throttles refresh signals", async () => {
    const signals: string[] = [];
    const scheduler = new DashboardRefreshScheduler(
      { debounceMs: 20, throttleMs: 100, batchWindowMs: 300 },
      () => {
        signals.push("flushed");
      },
    );

    scheduler.schedule("company-1");
    await sleep(30);
    assert.equal(signals.length, 1);
    scheduler.dispose();
  });

  it("pauses refresh while document is hidden", async () => {
    const signals: string[] = [];
    const scheduler = new DashboardRefreshScheduler(
      {
        debounceMs: 20,
        throttleMs: 100,
        batchWindowMs: 100,
        isDocumentVisible: () => false,
      },
      () => {
        signals.push("flushed");
      },
    );

    scheduler.schedule("company-1");
    await sleep(30);
    assert.equal(signals.length, 0);
    assert.equal(scheduler.paused, true);
    scheduler.dispose();
  });
});

describe("computeReconnectDelay", () => {
  it("uses exponential backoff with a cap", () => {
    assert.equal(computeReconnectDelay(1, 1_000, 30_000), 1_000);
    assert.equal(computeReconnectDelay(3, 1_000, 30_000), 4_000);
    assert.equal(computeReconnectDelay(10, 1_000, 30_000), 30_000);
  });
});

describe("mergePartialDashboardSnapshot", () => {
  it("replaces only affected provider metrics", () => {
    const cached: DashboardSnapshot = {
      companyId: "company-1",
      capturedAt: "2026-07-31T10:00:00.000Z",
      metrics: [
        { key: "crm.customers.total", category: "crm", label: "Customers", value: 10, capturedAt: "2026-07-31T10:00:00.000Z" },
        { key: "support.tickets.open", category: "support", label: "Tickets", value: 3, capturedAt: "2026-07-31T10:00:00.000Z" },
      ],
      providers: [
        { providerId: "crm", category: "crm", status: "success", metricCount: 1 },
        { providerId: "support", category: "support", status: "success", metricCount: 1 },
      ],
      warnings: [],
    };

    const partial: DashboardSnapshot = {
      companyId: "company-1",
      capturedAt: "2026-07-31T11:00:00.000Z",
      metrics: [
        { key: "crm.customers.total", category: "crm", label: "Customers", value: 12, capturedAt: "2026-07-31T11:00:00.000Z" },
      ],
      providers: [{ providerId: "crm", category: "crm", status: "success", metricCount: 1 }],
      warnings: [],
    };

    const merged = mergePartialDashboardSnapshot(cached, partial, ["crm"]);
    assert.equal(merged.metrics.find((metric) => metric.key === "crm.customers.total")?.value, 12);
    assert.equal(merged.metrics.find((metric) => metric.key === "support.tickets.open")?.value, 3);
  });

  it("rejects cross-company merge", () => {
    assert.throws(
      () =>
        mergePartialDashboardSnapshot(
          { companyId: "company-1", capturedAt: "", metrics: [], providers: [], warnings: [] },
          { companyId: "company-2", capturedAt: "", metrics: [], providers: [], warnings: [] },
          ["crm"],
        ),
      /Cross-company snapshot merge is forbidden/,
    );
  });
});

describe("DashboardRealtimeEngine", () => {
  it("subscribes, batches events, and emits scoped refresh signals", async () => {
    const port = new InMemoryDashboardRealtimeEventPort();
    const engine = new DashboardRealtimeEngine(port, {
      debounceMs: 20,
      throttleMs: 50,
      batchWindowMs: 500,
      heartbeatIntervalMs: 60_000,
    });

    const refreshCalls: string[] = [];
    await engine.subscribe({
      companyId: "company-1",
      access,
      allowedProviderIds: ["crm", "finance", "support"],
      onRefresh: async (signal) => {
        refreshCalls.push(signal.scope.providerIds.join("|"));
      },
    });

    port.emit(buildEvent("customer_created"));
    port.emit(buildEvent("invoice_paid"));
    await sleep(40);

    assert.ok(refreshCalls.length >= 1);
    assert.ok(refreshCalls[0].includes("crm"));
    engine.unsubscribe("company-1");
  });

  it("filters refresh scope by provider permissions", async () => {
    const port = new InMemoryDashboardRealtimeEventPort();
    const engine = new DashboardRealtimeEngine(port, { debounceMs: 10, throttleMs: 10, batchWindowMs: 500 });

    const scopes: string[][] = [];
    await engine.subscribe({
      companyId: "company-1",
      access,
      allowedProviderIds: ["crm"],
      onRefresh: async (signal) => {
        scopes.push(signal.scope.providerIds);
      },
    });

    port.emit(buildEvent("invoice_paid"));
    await sleep(30);
    assert.equal(scopes.length, 0);
    engine.unsubscribe("company-1");
  });

  it("rejects cross-company subscriptions", async () => {
    const port = new InMemoryDashboardRealtimeEventPort();
    const engine = new DashboardRealtimeEngine(port);
    await assert.rejects(
      () =>
        engine.subscribe({
          companyId: "company-2",
          access,
          allowedProviderIds: ["crm"],
          onRefresh: async () => {},
        }),
      /Cross-company realtime subscription is forbidden/,
    );
  });

  it("reconnects after disconnect with backoff", async () => {
    const port = new InMemoryDashboardRealtimeEventPort();
    const engine = new DashboardRealtimeEngine(port, {
      debounceMs: 10,
      throttleMs: 10,
      reconnectBaseDelayMs: 20,
      heartbeatIntervalMs: 60_000,
    });

    const states: string[] = [];
    await engine.subscribe({
      companyId: "company-1",
      access,
      allowedProviderIds: ["crm"],
      onRefresh: async () => {},
      onConnectionChange: (state) => states.push(state),
    });

    port.setConnectionState("company-1", "disconnected");
    await sleep(30);
    assert.ok(states.includes("reconnecting"));
    engine.unsubscribe("company-1");
  });

  it("unsubscribes cleanly", async () => {
    const port = new InMemoryDashboardRealtimeEventPort();
    const engine = new DashboardRealtimeEngine(port, { heartbeatIntervalMs: 60_000 });
    const subscription = await engine.subscribe({
      companyId: "company-1",
      access,
      allowedProviderIds: ["crm"],
      onRefresh: async () => {},
    });

    subscription.unsubscribe();
    port.emit(buildEvent("customer_created"));
    assert.equal(port.getConnectionState("company-1"), "disconnected");
  });
});
