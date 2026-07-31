import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyDashboardQuery, buildDashboardQuery } from "./dashboard-query.js";
import type { DashboardSnapshot } from "./types.js";

describe("DashboardQuery", () => {
  const snapshot: DashboardSnapshot = {
    companyId: "company-1",
    capturedAt: "2026-07-31T10:00:00.000Z",
    metrics: [
      {
        key: "customers.total",
        category: "crm",
        label: "Customers",
        value: 10,
        capturedAt: "2026-07-31T10:00:00.000Z",
      },
      {
        key: "tickets.open",
        category: "support",
        label: "Open tickets",
        value: 3,
        capturedAt: "2026-07-31T10:00:00.000Z",
      },
    ],
    providers: [
      { providerId: "crm", category: "crm", status: "success", metricCount: 1 },
      { providerId: "support", category: "support", status: "success", metricCount: 1 },
    ],
    warnings: [],
  };

  it("builds typed dashboard queries", () => {
    const query = buildDashboardQuery({
      companyId: "company-1",
      categories: ["crm"],
      metricKeys: ["customers.total"],
    });

    assert.equal(query.companyId, "company-1");
    assert.deepEqual(query.filter?.categories, ["crm"]);
  });

  it("filters merged snapshots by category and metric key", () => {
    const filtered = applyDashboardQuery(snapshot, {
      companyId: "company-1",
      filter: {
        categories: ["support"],
        metricKeys: ["tickets.open"],
      },
    });

    assert.equal(filtered.metrics.length, 1);
    assert.equal(filtered.metrics[0]?.category, "support");
  });
});
