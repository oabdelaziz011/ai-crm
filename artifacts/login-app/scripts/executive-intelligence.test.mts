import assert from "node:assert/strict";
import { buildExecutiveSummary } from "../src/lib/executive/selectors/executive-summary-selector.ts";
import { buildOperationalKpis } from "../src/lib/executive/selectors/operational-kpi-selector.ts";
import { buildDoctorIntelligence } from "../src/lib/executive/selectors/doctor-intelligence-selector.ts";
import { buildBranchIntelligence } from "../src/lib/executive/selectors/branch-intelligence-selector.ts";
import { computeTrend, linearForecast, healthScore, percentRate } from "../src/lib/executive/selectors/executive-math.ts";
import { ForecastEngineService } from "../src/lib/executive/forecasting/forecast-engine-service.ts";
import { AlertEngineService } from "../src/lib/executive/alerts/alert-engine-service.ts";
import type { RawExecutiveData, ExecutiveDashboardSnapshot } from "../src/lib/executive/types/executive-types.ts";

function sampleRaw(overrides: Partial<RawExecutiveData> = {}): RawExecutiveData {
  return {
    financialMetrics: {
      dailyCents: 50000,
      monthlyCents: 1500000,
      yearlyCents: 18000000,
      outstandingCents: 20000,
      refundCents: 5000,
      averageInvoiceCents: 10000,
      invoiceCount: 10,
      paymentCount: 8,
    },
    communicationStats: { sentToday: 100, delivered: 90, queued: 5, failed: 5, retrying: 0 },
    portalAnalytics: { portalVisits: 50, bookingConversionRate: 20, onlineBookingPercent: 30, cancellationRate: 5 },
    bookingsToday: [
      { id: "b1", status: "completed", branchId: "br1", resourceId: "r1", resourceName: "Dr A", branchName: "Main", serviceId: "s1", startAt: "2026-07-26T09:00:00Z", endAt: "2026-07-26T09:30:00Z", priceCents: 5000 },
      { id: "b2", status: "cancelled", branchId: "br1", resourceId: "r1", resourceName: "Dr A", branchName: "Main", serviceId: "s1", startAt: "2026-07-26T10:00:00Z", endAt: "2026-07-26T10:30:00Z", priceCents: 5000 },
    ],
    bookingsHistory: [
      { date: "2026-07-24", count: 5, revenueCents: 25000 },
      { date: "2026-07-25", count: 8, revenueCents: 40000 },
      { date: "2026-07-26", count: 2, revenueCents: 10000 },
    ],
    customers: { total: 100, newThisMonth: 10, returning: 30 },
    branches: [{ id: "br1", name: "Main" }],
    paymentsTodayCents: 5000,
    taxCollectedCents: 7000,
    providerBreakdown: [{ provider: "sandbox", amountCents: 5000 }],
    ...overrides,
  };
}

function sampleSnapshot(overrides: Partial<ExecutiveDashboardSnapshot> = {}): ExecutiveDashboardSnapshot {
  const raw = sampleRaw();
  return {
    summary: buildExecutiveSummary(raw),
    operational: buildOperationalKpis(raw),
    financial: { revenueCents: 1500000, profitCents: null, revenuePerDoctorCents: 750000, revenuePerBranchCents: 1500000, revenuePerServiceCents: 150000, outstandingInvoicesCents: 20000, refundRate: 0, averagePaymentTimeHours: 24, taxCollectedCents: 7000, collectionsCents: 5000, providerBreakdown: [] },
    customer: { newCustomers: 10, returningCustomers: 30, retentionRate: 30, churnRate: null, lifetimeValueCents: null, repeatBookingPercent: 30, averageCustomerAgeYears: null, customerGrowthPercent: 11, marketingOptInPercent: 0, portalUsageCount: 50 },
    communication: { whatsappDelivered: 54, emailDelivered: 36, failedMessages: 5, openRate: null, reminderSuccessRate: 90, deliverySuccessRate: 95, averageResponseMinutes: null },
    branches: buildBranchIntelligence(raw),
    doctors: buildDoctorIntelligence(raw),
    alerts: [],
    forecasts: [],
    timeline: [],
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

{
  const raw = sampleRaw();
  const summary = buildExecutiveSummary(raw);
  assert.equal(summary.bookingsToday, 2);
  assert.equal(summary.completedToday, 1);
  assert.equal(summary.cancelledToday, 1);
}

{
  const raw = sampleRaw();
  const ops = buildOperationalKpis(raw);
  assert.equal(ops.completionRate, 50);
  assert.equal(ops.cancellationRate, 50);
}

{
  assert.equal(percentRate(1, 4), 25);
  assert.equal(computeTrend(120, 100).trend, "up");
  assert.equal(computeTrend(80, 100).trend, "down");
}

{
  const forecast = linearForecast([10, 20, 30], 3);
  assert.equal(forecast.length, 3);
  assert.ok(forecast[2]! >= forecast[0]!);
}

{
  const score = healthScore({ occupancy: 80, cancellationRate: 5, noShowRate: 5, waitMinutes: 10 });
  assert.ok(score > 50 && score <= 100);
}

{
  const engine = new ForecastEngineService();
  const forecasts = engine.buildForecasts(sampleRaw(), [7]);
  assert.ok(forecasts.length >= 4);
  assert.ok(forecasts.some((f) => f.forecastType === "revenue"));
}

{
  class StubAlertRepo {
    created: unknown[] = [];
    async listActive() { return []; }
    async create(input: unknown) { this.created.push(input); return { id: "a1", ...input as object, status: "active", createdAt: new Date().toISOString() }; }
    async dismiss() {}
    async resolve() {}
  }
  const repo = new StubAlertRepo();
  const alerts = new AlertEngineService(repo as never);
  const snapshot = sampleSnapshot({
    operational: { appointments: 2, completionRate: 30, cancellationRate: 25, noShowRate: 20, averageWaitingMinutes: 45, averageVisitDurationMinutes: 30, peakHour: "10:00", capacityUtilization: 95, doctorOccupancy: 90, roomOccupancy: 80, equipmentUtilization: 70 },
  });
  const created = await alerts.evaluateAndPersist("c1", snapshot);
  assert.ok(created.length > 0);
}

console.log("executive-intelligence.test.mts: all assertions passed");
