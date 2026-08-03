import type {
  DashboardInsightSeverity,
  DashboardMetric,
  DashboardSnapshot,
  DashboardTimeRangeKey,
} from "@workspace/dashboard-engine";

export type DashboardTimeRange = DashboardTimeRangeKey;

export type KpiCardState = "loading" | "ready" | "empty" | "error";

export type ExecutiveKpiCardModel = {
  id: string;
  metricKey: string;
  titleKey: string;
  icon: string;
  state: KpiCardState;
  value: string;
  trend: "up" | "down" | "flat" | "unknown";
  changePercent: number | null;
  errorMessage?: string;
};

export type ExecutiveChartPoint = {
  label: string;
  value: number;
};

export type ExecutiveAnalyticsCardModel = {
  id: string;
  titleKey: string;
  subtitleKey: string;
  metricKey: string;
  state: KpiCardState;
  series: ExecutiveChartPoint[];
  emptyKey: string;
};

export type ExecutiveActivityItemModel = {
  id: string;
  titleKey: string;
  description: string;
  timestamp: string;
  module: string;
  tone: "info" | "success" | "warning" | "error";
};

export type ExecutiveInsightModel = {
  id: string;
  title: string;
  summary: string;
  details: string;
  category: string;
  severity: DashboardInsightSeverity;
  priority: "high" | "medium" | "low";
};

export type ExecutiveRecommendedActionModel = {
  id: string;
  label: string;
  description: string;
  category: string;
  priority: number;
};

export type ExecutiveSummaryViewModel = {
  healthKey: string;
  health: string;
  topWins: string[];
  topRisks: string[];
  immediateActions: ExecutiveRecommendedActionModel[];
  longTermOpportunities: ExecutiveRecommendedActionModel[];
};

export type ExecutiveQuickActionModel = {
  id: string;
  labelKey: string;
  path: string;
  icon: string;
  permission?: string;
};

export type ExecutiveDashboardViewModel = {
  kpis: ExecutiveKpiCardModel[];
  analytics: ExecutiveAnalyticsCardModel[];
  activities: ExecutiveActivityItemModel[];
  insights: ExecutiveInsightModel[];
  executiveSummary: ExecutiveSummaryViewModel | null;
  quickActions: ExecutiveQuickActionModel[];
  hasMetrics: boolean;
  providerErrors: string[];
};

function mapInsightPriority(severity: DashboardInsightSeverity): ExecutiveInsightModel["priority"] {
  if (severity === "critical" || severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

const HEALTH_I18N_KEYS: Record<string, string> = {
  excellent: "executiveDashboard.health.excellent",
  good: "executiveDashboard.health.good",
  fair: "executiveDashboard.health.fair",
  at_risk: "executiveDashboard.health.atRisk",
  critical: "executiveDashboard.health.critical",
};

function mapExecutiveSummary(snapshot: DashboardSnapshot | undefined): ExecutiveSummaryViewModel | null {
  const summary = snapshot?.executiveInsights?.summary;
  if (!summary) return null;

  return {
    healthKey: HEALTH_I18N_KEYS[summary.overallBusinessHealth] ?? HEALTH_I18N_KEYS.good,
    health: summary.overallBusinessHealth,
    topWins: summary.topWins,
    topRisks: summary.topRisks,
    immediateActions: summary.immediateActions.map((action) => ({
      id: action.id,
      label: action.label,
      description: action.description,
      category: action.category,
      priority: action.priority,
    })),
    longTermOpportunities: summary.longTermOpportunities.map((action) => ({
      id: action.id,
      label: action.label,
      description: action.description,
      category: action.category,
      priority: action.priority,
    })),
  };
}

function mapInsights(snapshot: DashboardSnapshot | undefined): ExecutiveInsightModel[] {
  const engineInsights = snapshot?.executiveInsights?.insights ?? [];
  return engineInsights
    .filter((insight) => insight.insightType !== "forecast_placeholder")
    .slice(0, 6)
    .map((insight) => ({
      id: insight.id,
      title: insight.title,
      summary: insight.summary,
      details: insight.details,
      category: insight.category,
      severity: insight.severity,
      priority: mapInsightPriority(insight.severity),
    }));
}

function findMetric(snapshot: DashboardSnapshot | undefined, key: string): DashboardMetric | undefined {
  return snapshot?.metrics.find((metric) => metric.key === key);
}

function readKpiAnalytics(snapshot: DashboardSnapshot | undefined, metricKey: string) {
  return snapshot?.trends?.[metricKey] ?? snapshot?.comparisons?.[metricKey] ?? snapshot?.analytics?.kpis?.[metricKey];
}

function readChartSeries(snapshot: DashboardSnapshot | undefined, metricKey: string): ExecutiveChartPoint[] {
  const fromHistorical = snapshot?.historicalValues?.[metricKey];
  if (fromHistorical?.length) {
    return fromHistorical.map((point) => ({ label: point.label, value: point.value }));
  }

  const fromChartSeries = snapshot?.chartSeries?.find((series) => series.metricKey === metricKey)?.points;
  if (fromChartSeries?.length) {
    return fromChartSeries.map((point) => ({ label: point.label, value: point.value }));
  }

  return [];
}

function formatMetricValue(metric: DashboardMetric | undefined, fallback = "—"): string {
  if (!metric || metric.value == null) return fallback;
  if (metric.unit === "currency") {
    const amount = Number(metric.value);
    if (!Number.isFinite(amount)) return fallback;
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  if (metric.unit === "percent") return `${metric.value}%`;
  return String(metric.value);
}

function providerFailed(snapshot: DashboardSnapshot | undefined, providerId: string): boolean {
  return snapshot?.providers.some(
    (provider) => provider.providerId === providerId && provider.status === "failed",
  ) ?? false;
}

function providerSkipped(snapshot: DashboardSnapshot | undefined, providerId: string): boolean {
  return snapshot?.providers.some(
    (provider) => provider.providerId === providerId && provider.status === "skipped",
  ) ?? false;
}

function resolveKpiState(
  snapshot: DashboardSnapshot | undefined,
  metricKey: string,
  providerId: string,
): KpiCardState {
  if (!snapshot) return "loading";
  if (providerFailed(snapshot, providerId)) return "error";
  if (providerSkipped(snapshot, providerId)) return "empty";
  const metric = findMetric(snapshot, metricKey);
  if (!metric || metric.value == null) return "empty";
  return "ready";
}

const KPI_DEFINITIONS = [
  { id: "revenueToday", metricKey: "finance.revenue.today", titleKey: "executiveDashboard.kpi.revenueToday", icon: "DollarSign", providerId: "finance" },
  { id: "revenue", metricKey: "finance.revenue", titleKey: "executiveDashboard.kpi.revenue", icon: "DollarSign", providerId: "finance" },
  { id: "outstanding", metricKey: "finance.outstanding", titleKey: "executiveDashboard.kpi.outstanding", icon: "FileText", providerId: "finance" },
  { id: "collectedToday", metricKey: "finance.collected_today", titleKey: "executiveDashboard.kpi.collectedToday", icon: "DollarSign", providerId: "finance" },
  { id: "bookingsToday", metricKey: "bookings.today", titleKey: "executiveDashboard.kpi.bookingsToday", icon: "CalendarDays", providerId: "bookings" },
  { id: "completedOps", metricKey: "operations.completed", titleKey: "executiveDashboard.kpi.completedOps", icon: "CalendarDays", providerId: "bookings" },
  { id: "utilization", metricKey: "operations.utilization", titleKey: "executiveDashboard.kpi.utilization", icon: "TrendingUp", providerId: "bookings" },
  { id: "customers", metricKey: "crm.customers.total", titleKey: "executiveDashboard.kpi.customers", icon: "Users", providerId: "crm" },
  { id: "newCustomers", metricKey: "customers.new", titleKey: "executiveDashboard.kpi.newCustomers", icon: "Users", providerId: "crm" },
  { id: "conversionRate", metricKey: "customers.conversion_rate", titleKey: "executiveDashboard.kpi.conversionRate", icon: "TrendingUp", providerId: "crm" },
  { id: "pendingPayments", metricKey: "payments.pending", titleKey: "executiveDashboard.kpi.pendingPayments", icon: "FileText", providerId: "finance" },
  { id: "noShowRate", metricKey: "operations.no_show_rate", titleKey: "executiveDashboard.kpi.noShowRate", icon: "CalendarDays", providerId: "bookings" },
] as const;

const ANALYTICS_DEFINITIONS = [
  { id: "revenueTrend", metricKey: "finance.revenue", titleKey: "executiveDashboard.analytics.revenueTrend", subtitleKey: "executiveDashboard.analytics.revenueTrendSub", providerId: "finance" },
  { id: "customerGrowth", metricKey: "crm.customers.new", titleKey: "executiveDashboard.analytics.customerGrowth", subtitleKey: "executiveDashboard.analytics.customerGrowthSub", providerId: "crm" },
  { id: "aiUsage", metricKey: "ai.conversations", titleKey: "executiveDashboard.analytics.aiUsage", subtitleKey: "executiveDashboard.analytics.aiUsageSub", providerId: "ai" },
  { id: "automationActivity", metricKey: "automation.runs", titleKey: "executiveDashboard.analytics.automationActivity", subtitleKey: "executiveDashboard.analytics.automationActivitySub", providerId: "automation" },
  { id: "supportActivity", metricKey: "support.tickets.open", titleKey: "executiveDashboard.analytics.supportActivity", subtitleKey: "executiveDashboard.analytics.supportActivitySub", providerId: "support" },
] as const;

export const EXECUTIVE_DASHBOARD_QUICK_ACTIONS: ExecutiveQuickActionModel[] = [
  { id: "new-customer", labelKey: "executiveDashboard.actions.newCustomer", path: "/dashboard/customers", icon: "UserPlus", permission: "customers.create" },
  { id: "new-booking", labelKey: "executiveDashboard.actions.newBooking", path: "/dashboard/bookings", icon: "CalendarPlus", permission: "bookings.create" },
  { id: "create-invoice", labelKey: "executiveDashboard.actions.createInvoice", path: "/dashboard/invoices", icon: "FileText", permission: "invoices.create" },
  { id: "launch-campaign", labelKey: "executiveDashboard.actions.launchCampaign", path: "/dashboard/channels", icon: "Megaphone", permission: "channels.view" },
  { id: "open-ai", labelKey: "executiveDashboard.actions.openAi", path: "/dashboard/ai-chat", icon: "Sparkles", permission: "ai_chat.view" },
];

export function buildExecutiveDashboardViewModel(
  snapshot: DashboardSnapshot | undefined,
  options?: { loading?: boolean },
): ExecutiveDashboardViewModel {
  const loading = options?.loading ?? !snapshot;

  const kpis: ExecutiveKpiCardModel[] = KPI_DEFINITIONS.map((definition) => {
    const metric = findMetric(snapshot, definition.metricKey);
    const kpiAnalytics = readKpiAnalytics(snapshot, definition.metricKey);
    const changePercent = kpiAnalytics?.percentageDifference ?? null;
    const state = loading ? "loading" : resolveKpiState(snapshot, definition.metricKey, definition.providerId);
    const providerError = snapshot?.providers.find(
      (provider) => provider.providerId === definition.providerId && provider.status === "failed",
    )?.error;

    return {
      id: definition.id,
      metricKey: definition.metricKey,
      titleKey: definition.titleKey,
      icon: definition.icon,
      state,
      value: formatMetricValue(metric),
      trend: kpiAnalytics?.trendDirection ?? metric?.trend ?? "unknown",
      changePercent,
      errorMessage: providerError,
    };
  });

  const analytics: ExecutiveAnalyticsCardModel[] = ANALYTICS_DEFINITIONS.map((definition) => {
    const series = readChartSeries(snapshot, definition.metricKey);
    const state = loading ? "loading" : resolveKpiState(snapshot, definition.metricKey, definition.providerId);

    return {
      id: definition.id,
      metricKey: definition.metricKey,
      titleKey: definition.titleKey,
      subtitleKey: definition.subtitleKey,
      state,
      series,
      emptyKey: "executiveDashboard.analytics.noData",
    };
  });

  const activities: ExecutiveActivityItemModel[] = (snapshot?.providers ?? []).map((provider) => ({
    id: `provider-${provider.providerId}`,
    titleKey:
      provider.status === "success"
        ? "executiveDashboard.activity.providerSuccess"
        : provider.status === "failed"
          ? "executiveDashboard.activity.providerFailed"
          : "executiveDashboard.activity.providerSkipped",
    description: provider.error ?? `${provider.metricCount} metrics`,
    timestamp: snapshot?.capturedAt ?? new Date().toISOString(),
    module: provider.category,
    tone:
      provider.status === "success"
        ? "success"
        : provider.status === "failed"
          ? "error"
          : "info",
  }));

  for (const [index, warning] of (snapshot?.warnings ?? []).entries()) {
    activities.unshift({
      id: `warning-${index}`,
      titleKey: "executiveDashboard.activity.warning",
      description: warning,
      timestamp: snapshot?.capturedAt ?? new Date().toISOString(),
      module: "system",
      tone: "warning",
    });
  }

  const insights = mapInsights(snapshot);
  const executiveSummary = mapExecutiveSummary(snapshot);

  return {
    kpis,
    analytics,
    activities,
    insights,
    executiveSummary,
    quickActions: EXECUTIVE_DASHBOARD_QUICK_ACTIONS,
    hasMetrics: (snapshot?.metrics.length ?? 0) > 0,
    providerErrors: (snapshot?.providers ?? [])
      .filter((provider) => provider.status === "failed")
      .map((provider) => provider.error ?? provider.providerId),
  };
}
