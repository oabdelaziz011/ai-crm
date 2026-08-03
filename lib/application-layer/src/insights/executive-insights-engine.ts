import type { ExecutiveAnalyticsSnapshotModel } from "../ports/repository-ports.js";
import type { ExecutiveInsightDto, ExecutiveInsightsProjectionDto } from "../dto/query-dtos.js";

function findKpi(snapshot: ExecutiveAnalyticsSnapshotModel, key: string) {
  return snapshot.kpis.find((kpi) => kpi.key === key);
}

function pctChange(current: number, previous?: number): number | null {
  if (previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function buildInsight(input: Omit<ExecutiveInsightDto, "id"> & { id?: string }): ExecutiveInsightDto {
  return Object.freeze({
    id: input.id ?? `insight_${input.category}_${input.title.replace(/\s+/g, "_").toLowerCase()}`,
    title: input.title,
    summary: input.summary,
    details: input.details,
    category: input.category,
    severity: input.severity,
    confidence: input.confidence,
    reason: input.reason,
    suggestedAction: input.suggestedAction,
    navigationTarget: input.navigationTarget,
  });
}

/** Rule-based executive insights from live analytics snapshot. */
export function generateExecutiveInsights(
  snapshot: ExecutiveAnalyticsSnapshotModel,
): ExecutiveInsightsProjectionDto {
  const insights: ExecutiveInsightDto[] = [];
  const topWins: string[] = [];
  const topRisks: string[] = [];

  const todayRevenue = findKpi(snapshot, "finance.revenue.today");
  const yesterdayRevenue = todayRevenue?.previousValue;
  const revenueChange = pctChange(todayRevenue?.value ?? 0, yesterdayRevenue);

  if (revenueChange != null && revenueChange >= 10) {
    insights.push(
      buildInsight({
        title: "Revenue momentum",
        summary: `Revenue increased ${revenueChange}% compared to yesterday.`,
        details: `Today's collected revenue is trending above the prior period.`,
        category: "revenue",
        severity: "info",
        confidence: 0.85,
        reason: "Day-over-day revenue comparison",
        suggestedAction: "Review top-performing services and replicate demand drivers.",
        navigationTarget: "/dashboard/executive",
      }),
    );
    topWins.push(`Revenue up ${revenueChange}% vs yesterday`);
  } else if (revenueChange != null && revenueChange <= -10) {
    insights.push(
      buildInsight({
        title: "Revenue decline",
        summary: `Revenue decreased ${Math.abs(revenueChange)}% compared to yesterday.`,
        details: "Collections are below the prior period baseline.",
        category: "revenue",
        severity: "high",
        confidence: 0.82,
        reason: "Day-over-day revenue comparison",
        suggestedAction: "Investigate unpaid invoices and follow up on outstanding balances.",
        navigationTarget: "/dashboard/invoices",
      }),
    );
    topRisks.push(`Revenue down ${Math.abs(revenueChange)}% vs yesterday`);
  }

  const outstanding = findKpi(snapshot, "finance.outstanding");
  if (outstanding && outstanding.value > 0) {
    const count = Math.max(1, Math.round(outstanding.value / Math.max(outstanding.previousValue ?? outstanding.value, 1)));
    insights.push(
      buildInsight({
        title: "Outstanding balances",
        summary: `${count > 1 ? "Several customers still have" : "Customer has"} outstanding balances.`,
        details: `Total outstanding: ${(outstanding.value / 100).toFixed(0)} ${snapshot.currency}.`,
        category: "finance",
        severity: outstanding.value > 500_00 ? "high" : "medium",
        confidence: 0.9,
        reason: "Open invoice balances",
        suggestedAction: "Collect payments from customers with overdue invoices.",
        navigationTarget: "/dashboard/invoices",
      }),
    );
    topRisks.push("Outstanding invoice balances need attention");
  }

  const utilization = findKpi(snapshot, "operations.utilization");
  if (utilization && utilization.value >= 85) {
    insights.push(
      buildInsight({
        title: "High resource utilization",
        summary: `Resource utilization reached ${utilization.value.toFixed(0)}%.`,
        details: "Capacity is near peak for the selected period.",
        category: "operations",
        severity: utilization.value >= 94 ? "high" : "medium",
        confidence: 0.88,
        reason: "Booked hours vs available capacity",
        suggestedAction: "Recommend opening another resource during peak windows.",
        navigationTarget: "/dashboard/bookings",
      }),
    );
    if (utilization.value >= 94) topRisks.push("Resource utilization above 94%");
  }

  const noShowRate = findKpi(snapshot, "operations.no_show_rate");
  if (noShowRate && noShowRate.value >= 8) {
    insights.push(
      buildInsight({
        title: "No-show rate elevated",
        summary: "No-show rate increased this week.",
        details: `Current no-show rate: ${noShowRate.value.toFixed(1)}%.`,
        category: "operations",
        severity: "medium",
        confidence: 0.8,
        reason: "Cancelled/no-show bookings ratio",
        suggestedAction: "Enable reminder automations and confirm high-risk appointments.",
        navigationTarget: "/dashboard/bookings",
      }),
    );
    topRisks.push("Elevated no-show rate");
  }

  const topBranch = snapshot.breakdowns.revenueByBranch[0];
  if (topBranch && todayRevenue && todayRevenue.value > 0) {
    const share = Math.round((topBranch.value / todayRevenue.value) * 100);
    if (share >= 50) {
      insights.push(
        buildInsight({
          title: "Branch concentration",
          summary: `Branch ${topBranch.name} generated ${share}% of today's revenue.`,
          details: "Revenue is concentrated in a single branch.",
          category: "operations",
          severity: "info",
          confidence: 0.75,
          reason: "Branch revenue share",
          suggestedAction: "Review branch capacity and cross-promote underperforming locations.",
          navigationTarget: "/dashboard/executive",
        }),
      );
    }
  }

  const topEmployee = snapshot.rankings.employees[0];
  if (topEmployee && todayRevenue && todayRevenue.value > 0) {
    insights.push(
      buildInsight({
        title: "Top performer",
        summary: `Employee ${topEmployee.name} exceeded today's target.`,
        details: `Contributed ${(topEmployee.value / 100).toFixed(0)} in revenue.`,
        category: "operations",
        severity: "info",
        confidence: 0.7,
        reason: "Employee revenue ranking",
        suggestedAction: "Recognize top performers and review scheduling load balance.",
        navigationTarget: "/dashboard/bookings",
      }),
    );
    topWins.push(`${topEmployee.name} leading employee revenue`);
  }

  const upcoming = findKpi(snapshot, "bookings.upcoming");
  if (upcoming && upcoming.value >= 5) {
    insights.push(
      buildInsight({
        title: "Peak booking window",
        summary: "Peak booking window approaching within the next hour.",
        details: `${Math.round(upcoming.value)} upcoming bookings scheduled soon.`,
        category: "operations",
        severity: "medium",
        confidence: 0.65,
        reason: "Upcoming booking density",
        suggestedAction: "Ensure reception staffing and resource availability.",
        navigationTarget: "/dashboard/bookings",
      }),
    );
  }

  let health: ExecutiveInsightsProjectionDto["summary"]["health"] = "good";
  if (topRisks.length >= 3 || insights.some((i) => i.severity === "critical")) health = "critical";
  else if (topRisks.length >= 2 || insights.some((i) => i.severity === "high")) health = "at_risk";
  else if (topWins.length >= 2 && topRisks.length === 0) health = "excellent";
  else if (topRisks.length === 1) health = "fair";

  return Object.freeze({
    insights: Object.freeze(insights.slice(0, 12)),
    summary: Object.freeze({
      health,
      topWins: Object.freeze(topWins.slice(0, 5)),
      topRisks: Object.freeze(topRisks.slice(0, 5)),
    }),
  });
}
