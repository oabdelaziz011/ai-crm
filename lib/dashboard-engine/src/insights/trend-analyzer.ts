import type { DashboardKpiAnalytics } from "../analytics/analytics-types.js";
import type { DashboardInsightCategory, DashboardInsightType } from "./insight-types.js";

export type TrendAnalysisResult = {
  metricKey: string;
  category: DashboardInsightCategory;
  insightType: DashboardInsightType;
  changePercent: number | null;
  direction: DashboardKpiAnalytics["trendDirection"];
  strength: DashboardKpiAnalytics["trendStrength"];
  isSignificant: boolean;
};

const METRIC_CATEGORY_MAP: Record<string, DashboardInsightCategory> = {
  "finance.revenue": "revenue",
  "crm.customers.total": "customers",
  "crm.customers.new": "customers",
  "crm.customers.active": "customers",
  "crm.leads": "sales",
  "crm.deals": "sales",
  "crm.pipeline.value": "sales",
  "support.tickets.open": "support",
  "support.sla.compliance": "support",
  "support.response.avg_minutes": "support",
  "ai.conversations": "ai",
  "ai.success_rate": "ai",
  "ai.tool_calls": "ai",
  "automation.runs": "automation",
  "automation.failure": "automation",
  "automation.success": "automation",
  "knowledge.searches": "knowledge",
  "channels.whatsapp": "channels",
  "channels.failed_deliveries": "channels",
  "invoices.outstanding": "finance",
  "bookings.total": "operations",
};

export class TrendAnalyzer {
  resolveCategory(metricKey: string, fallbackCategory?: string): DashboardInsightCategory {
    if (METRIC_CATEGORY_MAP[metricKey]) return METRIC_CATEGORY_MAP[metricKey];
    if (fallbackCategory === "finance") return "finance";
    if (fallbackCategory === "crm") return "customers";
    if (fallbackCategory === "support") return "support";
    if (fallbackCategory === "ai") return "ai";
    if (fallbackCategory === "automation") return "automation";
    if (fallbackCategory === "knowledge") return "knowledge";
    if (fallbackCategory === "channels") return "channels";
    if (fallbackCategory === "sales") return "sales";
    return "operations";
  }

  analyzeTrends(
    trends: Record<string, DashboardKpiAnalytics>,
    thresholds: { kpiDropPercent: number; kpiGrowthPercent: number },
  ): TrendAnalysisResult[] {
    return Object.values(trends).map((trend) => {
      const changePercent = trend.percentageDifference;
      const magnitude = changePercent == null ? 0 : Math.abs(changePercent);
      const isDrop = changePercent != null && changePercent <= -thresholds.kpiDropPercent;
      const isGrowth = changePercent != null && changePercent >= thresholds.kpiGrowthPercent;

      let insightType: DashboardInsightType = "information";
      if (isGrowth && trend.trendDirection === "up") insightType = "positive_trend";
      if (isDrop && trend.trendDirection === "down") insightType = "negative_trend";

      return {
        metricKey: trend.metricKey,
        category: this.resolveCategory(trend.metricKey, String(trend.category)),
        insightType,
        changePercent,
        direction: trend.trendDirection,
        strength: trend.trendStrength,
        isSignificant: isDrop || isGrowth,
      };
    });
  }
}

export const trendAnalyzer = new TrendAnalyzer();
