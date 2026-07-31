import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  comparisonEngine,
  growthCalculator,
  trendCalculator,
  analyticsAggregator,
  DashboardAnalyticsEngine,
  createInMemoryDashboardHistoricalDataPort,
  seedDailyMetric,
  type DashboardSnapshot,
} from "../index.js";

describe("GrowthCalculator", () => {
  it("computes absolute and percentage differences", () => {
    assert.equal(growthCalculator.absoluteDifference(120, 100), 20);
    assert.equal(growthCalculator.percentageDifference(120, 100), 20);
    assert.equal(growthCalculator.percentageDifference(0, 0), 0);
    assert.equal(growthCalculator.percentageDifference(10, 0), null);
  });
});

describe("TrendCalculator", () => {
  it("derives direction and strength", () => {
    assert.equal(trendCalculator.direction(150, 100), "up");
    assert.equal(trendCalculator.direction(80, 100), "down");
    assert.equal(trendCalculator.direction(50, 50), "flat");
    assert.equal(trendCalculator.strength(25), "strong");
    assert.equal(trendCalculator.strength(8), "moderate");
    assert.equal(trendCalculator.strength(2), "weak");
    assert.equal(trendCalculator.strength(0), "none");
  });
});

describe("ComparisonEngine", () => {
  it("resolves supported time ranges", () => {
    const current = comparisonEngine.resolveCurrentPeriod("30d", undefined, new Date("2026-07-31T12:00:00.000Z"));
    assert.equal(current.key, "30d");
    assert.ok(current.startAt < current.endAt);

    const previous = comparisonEngine.resolveComparisonPeriod(current);
    assert.ok(previous.endAt < current.startAt);
  });

  it("requires bounds for custom ranges", () => {
    assert.throws(() => comparisonEngine.resolveCurrentPeriod("custom"));
  });
});

describe("DashboardAnalyticsEngine", () => {
  const baseSnapshot: DashboardSnapshot = {
    companyId: "company-1",
    capturedAt: "2026-07-31T10:00:00.000Z",
    metrics: [
      {
        key: "crm.customers.total",
        category: "crm",
        label: "Total Customers",
        value: 120,
        capturedAt: "2026-07-31T10:00:00.000Z",
      },
      {
        key: "ai.conversations",
        category: "ai",
        label: "AI Conversations",
        value: 40,
        capturedAt: "2026-07-31T10:00:00.000Z",
      },
    ],
    providers: [],
    warnings: [],
  };

  it("enriches snapshots with analytics, trends, and chart series", async () => {
    const historicalPort = createInMemoryDashboardHistoricalDataPort({
      "company-1": {
        "crm.customers.total": seedDailyMetric("crm.customers.total", [
          { date: "2026-07-29", value: 10 },
          { date: "2026-07-30", value: 12 },
          { date: "2026-07-31", value: 14 },
        ]),
      },
    });

    const engine = new DashboardAnalyticsEngine({ historicalPort });
    const enriched = await engine.enrich(baseSnapshot, {
      companyId: "company-1",
      timeRange: "7d",
    });

    assert.ok(enriched.analytics);
    assert.ok(enriched.chartSeries && enriched.chartSeries.length > 0);
    assert.ok(enriched.trends?.["crm.customers.total"]);
    assert.ok(enriched.comparisons?.["crm.customers.total"]);
    assert.ok(enriched.historicalValues?.["crm.customers.new"]?.length);
    assert.ok(enriched.refreshTimestamp);

    const kpi = enriched.trends?.["crm.customers.total"];
    assert.equal(typeof kpi?.currentValue, "number");
    assert.equal(typeof kpi?.previousValue, "number");
    assert.ok(["up", "down", "flat", "unknown"].includes(kpi?.trendDirection ?? ""));
    assert.ok(kpi?.comparisonPeriod.startAt);
  });

  it("rejects cross-company enrichment", async () => {
    const engine = new DashboardAnalyticsEngine({
      historicalPort: createInMemoryDashboardHistoricalDataPort(),
    });

    await assert.rejects(
      () =>
        engine.enrich(baseSnapshot, {
          companyId: "company-2",
          timeRange: "30d",
        }),
      /Cross-company analytics enrichment is forbidden/,
    );
  });

  it("builds chart datasets for registered enterprise modules", () => {
    const buckets = seedDailyMetric("channels.whatsapp", [
      { date: "2026-07-29", value: 4 },
      { date: "2026-07-30", value: 6 },
      { date: "2026-07-31", value: 8 },
    ]);

    const { chartSeries, historicalValues } = analyticsAggregator.buildChartSeries(buckets, "7d");
    assert.ok(chartSeries.some((series) => series.id === "channels.whatsapp"));
    assert.ok((historicalValues["channels.whatsapp"]?.length ?? 0) > 0);
  });
});
