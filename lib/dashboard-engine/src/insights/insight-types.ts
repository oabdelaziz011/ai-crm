export const DASHBOARD_INSIGHT_CATEGORIES = [
  "revenue",
  "customers",
  "sales",
  "support",
  "ai",
  "automation",
  "knowledge",
  "marketing",
  "channels",
  "finance",
  "operations",
] as const;

export type DashboardInsightCategory = (typeof DASHBOARD_INSIGHT_CATEGORIES)[number];

export const DASHBOARD_INSIGHT_TYPES = [
  "positive_trend",
  "negative_trend",
  "warning",
  "critical_alert",
  "opportunity",
  "recommendation",
  "forecast_placeholder",
  "information",
] as const;

export type DashboardInsightType = (typeof DASHBOARD_INSIGHT_TYPES)[number];

export const DASHBOARD_INSIGHT_SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;

export type DashboardInsightSeverity = (typeof DASHBOARD_INSIGHT_SEVERITIES)[number];

export const DASHBOARD_BUSINESS_HEALTH = [
  "excellent",
  "good",
  "fair",
  "at_risk",
  "critical",
] as const;

export type DashboardBusinessHealth = (typeof DASHBOARD_BUSINESS_HEALTH)[number];

export const DASHBOARD_RECOMMENDED_ACTION_TYPES = [
  "assign_agents",
  "launch_campaign",
  "review_automation",
  "increase_follow_up",
  "review_failed_workflows",
  "check_sla_backlog",
  "improve_response_time",
  "review_unpaid_invoices",
  "investigate_revenue_decline",
  "review_customer_churn",
  "optimize_ai_workflows",
  "review_knowledge_gaps",
] as const;

export type DashboardRecommendedActionType = (typeof DASHBOARD_RECOMMENDED_ACTION_TYPES)[number];

export type DashboardRecommendedAction = {
  id: string;
  actionType: DashboardRecommendedActionType;
  label: string;
  description: string;
  category: DashboardInsightCategory;
  priority: number;
  relatedMetrics: string[];
};

export type DashboardInsight = {
  id: string;
  title: string;
  summary: string;
  details: string;
  category: DashboardInsightCategory;
  insightType: DashboardInsightType;
  severity: DashboardInsightSeverity;
  confidence: number;
  affectedMetrics: string[];
  recommendedActions: DashboardRecommendedAction[];
  priority: number;
  generatedAt: string;
};

export type DashboardExecutiveSummary = {
  overallBusinessHealth: DashboardBusinessHealth;
  topWins: string[];
  topRisks: string[];
  immediateActions: DashboardRecommendedAction[];
  longTermOpportunities: DashboardRecommendedAction[];
  generatedAt: string;
};

export type DashboardExecutiveInsightBundle = {
  insights: DashboardInsight[];
  summary: DashboardExecutiveSummary;
  generatedAt: string;
};

export type DashboardInsightThresholds = {
  kpiDropPercent: number;
  kpiGrowthPercent: number;
  workflowFailureCount: number;
  ticketBacklogCount: number;
  aiSuccessRateMin: number;
  revenueDeclinePercent: number;
  customerLossPercent: number;
  slaComplianceMin: number;
  failedDeliveryCount: number;
};

export const DEFAULT_INSIGHT_THRESHOLDS: DashboardInsightThresholds = {
  kpiDropPercent: 15,
  kpiGrowthPercent: 25,
  workflowFailureCount: 5,
  ticketBacklogCount: 10,
  aiSuccessRateMin: 70,
  revenueDeclinePercent: 10,
  customerLossPercent: 10,
  slaComplianceMin: 85,
  failedDeliveryCount: 5,
};
