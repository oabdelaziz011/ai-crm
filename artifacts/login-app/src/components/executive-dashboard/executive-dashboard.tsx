import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Coins, FileText, Radio, Sparkles, Users } from "lucide-react";
import {
  formatExecutiveDate,
  DashboardHeader,
  type ExecutiveKpiFilterId,
} from "@/components/executive-dashboard/dashboard-header";
import { KpiGrid } from "@/components/executive-dashboard/kpi-grid";
import { AnalyticsGrid } from "@/components/executive-dashboard/analytics-grid";
import { ActivityFeed } from "@/components/executive-dashboard/activity-feed";
import { ExecutiveSummaryCard } from "@/components/executive-dashboard/executive-summary-card";
import { QuickActions } from "@/components/executive-dashboard/quick-actions";
import { ExecutiveIntelligencePanels } from "@/components/executive-dashboard/executive-intelligence-panels";
import { ExecutiveAiBridgePanel } from "@/components/executive-dashboard/executive-ai-bridge-panel";
import {
  DashboardEmpty,
  DashboardError,
  DashboardLoading,
} from "@/components/executive-dashboard/dashboard-states";
import { ModulePurposeBanner } from "@/components/dashboard/module-purpose-banner";
import { Button } from "@/components/ui/button";
import {
  useDashboardSnapshot,
  useRefreshDashboardSnapshot,
  type DashboardTimeRange,
  type ExecutiveAnalyticsCardModel,
  type ExecutiveActivityItemModel,
  type ExecutiveKpiCardModel,
  type ExecutiveQuickActionModel,
  type ExecutiveRecommendedActionModel,
} from "@/lib/dashboard";
import { useAuth } from "@/context/auth-context";
import { useCompanyIdentity } from "@/hooks/company-workspace/use-company-identity";
import { useAuthUser } from "@/hooks/use-rbac";
import { dashboardNestHref } from "@/lib/routing";

const KPI_FILTER_BY_ID: Record<string, Exclude<ExecutiveKpiFilterId, "all">> = {
  revenueToday: "finance",
  revenue: "finance",
  outstanding: "finance",
  collectedToday: "finance",
  pendingPayments: "finance",
  customers: "customers",
  newCustomers: "customers",
  conversionRate: "customers",
  bookingsToday: "operations",
  completedOps: "operations",
  utilization: "operations",
  noShowRate: "operations",
};

const KPI_HREF_BY_ID: Record<string, string> = {
  revenueToday: "/financial",
  revenue: "/financial",
  outstanding: "/invoices",
  collectedToday: "/financial",
  pendingPayments: "/invoices",
  customers: "/customers",
  newCustomers: "/customers",
  conversionRate: "/leads",
  bookingsToday: "/operations",
  completedOps: "/operations",
  utilization: "/operations",
  noShowRate: "/operations",
};

const ANALYTICS_HREF_BY_ID: Record<string, string> = {
  revenueTrend: "/financial",
  customerGrowth: "/customers",
  aiUsage: "/ai-analytics",
  automationActivity: "/automation",
  supportActivity: "/omnichannel",
};

function actionHref(action: ExecutiveRecommendedActionModel): string {
  const haystack = `${action.category} ${action.label} ${action.description}`.toLowerCase();
  if (/(invoice|billing|payment|revenue|finance|فاتور|مالي|إيراد)/i.test(haystack)) return "/invoices";
  if (/(customer|crm|عميل)/i.test(haystack)) return "/customers";
  if (/(booking|schedule|operation|حجز|جدولة|عمليات)/i.test(haystack)) return "/operations";
  if (/(lead|opportunity|فرصة|عميل محتمل)/i.test(haystack)) return "/leads";
  if (/(ai|assistant|ذكاء)/i.test(haystack)) return "/ai-chat";
  if (/(channel|campaign|قناة|حملة)/i.test(haystack)) return "/channels";
  return "/financial";
}

type ExecutiveDashboardProps = {
  companyName: string;
};

export const ExecutiveDashboard = memo(function ExecutiveDashboard({
  companyName,
}: ExecutiveDashboardProps) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>("30d");
  const [searchValue, setSearchValue] = useState("");
  const [kpiFilter, setKpiFilter] = useState<ExecutiveKpiFilterId>("all");

  const {
    canView,
    companyId,
    isLoading,
    isError,
    error,
    isFetching,
    viewModel,
    refetch,
  } = useDashboardSnapshot(timeRange);
  const refreshDashboard = useRefreshDashboardSnapshot();

  const timeRangeOptions = useMemo(
    () =>
      ([
        ["today", t("executiveDashboard.timeRange.today")],
        ["7d", t("executiveDashboard.timeRange.7d")],
        ["30d", t("executiveDashboard.timeRange.30d")],
        ["90d", t("executiveDashboard.timeRange.90d")],
      ] as const).map(([value, label]) => ({ value, label })),
    [t],
  );

  const navigate = useCallback(
    (path: string) => {
      setLocation(dashboardNestHref(path));
    },
    [setLocation],
  );

  const resolveKpiTitle = useCallback(
    (item: ExecutiveKpiCardModel) => t(item.titleKey),
    [t],
  );
  const resolveAnalyticsTitle = useCallback(
    (item: ExecutiveAnalyticsCardModel) => t(item.titleKey),
    [t],
  );
  const resolveAnalyticsSubtitle = useCallback(
    (item: ExecutiveAnalyticsCardModel) => t(item.subtitleKey),
    [t],
  );
  const resolveHealthLabel = useCallback(
    (healthKey: string) => t(healthKey),
    [t],
  );
  const resolveHealthStatus = useCallback(
    (health: string) =>
      t(`executiveDashboard.healthStatus.${health}`, {
        defaultValue: health.replace(/_/g, " "),
      }),
    [t],
  );
  const resolveActionLabel = useCallback(
    (action: ExecutiveQuickActionModel) => t(action.labelKey),
    [t],
  );

  const canRunAction = useCallback(
    (action: ExecutiveQuickActionModel) =>
      !action.permission || isSuperAdmin || hasPermission(action.permission),
    [hasPermission, isSuperAdmin],
  );

  const resolveActivityTitle = useCallback(
    (item: ExecutiveActivityItemModel) => t(item.titleKey),
    [t],
  );

  const resolveKpiHref = useCallback(
    (item: ExecutiveKpiCardModel) => KPI_HREF_BY_ID[item.id] ?? null,
    [],
  );

  const resolveAnalyticsHref = useCallback(
    (item: ExecutiveAnalyticsCardModel) => ANALYTICS_HREF_BY_ID[item.id] ?? null,
    [],
  );

  const handleRefresh = useCallback(() => {
    void refetch();
    if (companyId) refreshDashboard(companyId, timeRange);
  }, [companyId, refetch, refreshDashboard, timeRange]);

  const filteredKpis = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return viewModel.kpis.filter((item) => {
      if (kpiFilter !== "all" && KPI_FILTER_BY_ID[item.id] !== kpiFilter) return false;
      if (!query) return true;
      return t(item.titleKey).toLowerCase().includes(query);
    });
  }, [kpiFilter, searchValue, t, viewModel.kpis]);

  const headerProps = {
    companyName,
    dateLabel: formatExecutiveDate(new Date()),
    title: t("executiveDashboard.title"),
    subtitle: t("executiveDashboard.subtitle"),
    timeRange,
    timeRangeLabel: t("executiveDashboard.timeRange.label"),
    searchPlaceholder: t("executiveDashboard.searchPlaceholder"),
    searchValue,
    refreshLabel: t("executiveDashboard.refresh"),
    filterLabel: t("executiveDashboard.filter"),
    filterAllLabel: t("executiveDashboard.filterAll"),
    filterFinanceLabel: t("executiveDashboard.filterFinance"),
    filterCustomersLabel: t("executiveDashboard.filterCustomers"),
    filterOperationsLabel: t("executiveDashboard.filterOperations"),
    kpiFilter,
    isRefreshing: isFetching,
    onTimeRangeChange: setTimeRange,
    onSearchChange: setSearchValue,
    onKpiFilterChange: setKpiFilter,
    onRefresh: handleRefresh,
    timeRangeOptions,
  };

  const purposeBanner = (
    <ModulePurposeBanner
      title={t("executiveDashboard.purpose.title")}
      body={t("executiveDashboard.purpose.body")}
      points={[
        t("executiveDashboard.purpose.pointPulse"),
        t("executiveDashboard.purpose.pointAlerts"),
        t("executiveDashboard.purpose.pointActions"),
        t("executiveDashboard.purpose.pointAi"),
      ]}
      links={[
        {
          href: "/financial",
          label: t("executiveDashboard.purpose.openFinancial"),
          icon: Coins,
          variant: "secondary",
        },
        {
          href: "/invoices",
          label: t("executiveDashboard.purpose.openInvoices"),
          icon: FileText,
        },
        {
          href: "/customers",
          label: t("executiveDashboard.purpose.openCustomers"),
          icon: Users,
        },
        {
          href: "/communication",
          label: t("executiveDashboard.purpose.openQueue"),
          icon: Radio,
        },
        {
          href: "/ai-analytics",
          label: t("executiveDashboard.purpose.openAi"),
          icon: Sparkles,
        },
      ]}
    />
  );

  if (!canView) {
    return (
      <DashboardEmpty
        title={t("executiveDashboard.noPermissionTitle")}
        description={t("executiveDashboard.noPermissionBody")}
      />
    );
  }

  if (isLoading && !viewModel.hasMetrics) {
    return (
      <div className="space-y-6 p-6">
        {purposeBanner}
        <DashboardLoading label={t("executiveDashboard.loading")} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4 p-6">
        {purposeBanner}
        <DashboardError
          title={t("executiveDashboard.errorTitle")}
          description={error instanceof Error ? error.message : t("executiveDashboard.errorBody")}
          action={
            <Button variant="outline" onClick={handleRefresh}>
              {t("executiveDashboard.refresh")}
            </Button>
          }
        />
      </div>
    );
  }

  if (!viewModel.hasMetrics && !isLoading) {
    return (
      <div className="space-y-4 p-6">
        {purposeBanner}
        <DashboardHeader {...headerProps} />
        <DashboardEmpty
          title={t("executiveDashboard.emptyTitle")}
          description={t("executiveDashboard.emptyBody")}
          action={
            <Button variant="outline" onClick={handleRefresh}>
              {t("executiveDashboard.refresh")}
            </Button>
          }
        />
        <ExecutiveAiBridgePanel
          timeRange={timeRange}
          kpis={viewModel.kpis}
          resolveKpiTitle={resolveKpiTitle}
        />
        <ExecutiveIntelligencePanels />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <DashboardHeader {...headerProps} />

      {purposeBanner}

      <KpiGrid
        items={filteredKpis}
        resolveTitle={resolveKpiTitle}
        comparisonLabel={t("executiveDashboard.vsPreviousPeriod")}
        emptyLabel={t("executiveDashboard.kpi.empty")}
        errorLabel={t("executiveDashboard.kpi.error")}
        resolveHref={resolveKpiHref}
        onNavigate={navigate}
      />

      <ExecutiveAiBridgePanel
        timeRange={timeRange}
        kpis={viewModel.kpis}
        resolveKpiTitle={resolveKpiTitle}
      />

      <AnalyticsGrid
        items={viewModel.analytics}
        resolveTitle={resolveAnalyticsTitle}
        resolveSubtitle={resolveAnalyticsSubtitle}
        emptyLabel={t("executiveDashboard.analytics.noData")}
        resolveHref={resolveAnalyticsHref}
        onNavigate={navigate}
      />

      <ExecutiveIntelligencePanels />

      <div className="grid gap-4 xl:grid-cols-2">
        <ActivityFeed
          items={viewModel.activities}
          title={t("executiveDashboard.activity.title")}
          emptyLabel={t("executiveDashboard.activity.empty")}
          loading={isLoading}
          refreshLabel={t("executiveDashboard.activity.refresh")}
          openIntegrationsLabel={t("executiveDashboard.activity.openIntegrations")}
          isRefreshing={isFetching}
          onRefresh={handleRefresh}
          onOpenIntegrations={() => navigate("/integrations")}
          resolveTitle={resolveActivityTitle}
        />
        <ExecutiveSummaryCard
          title={t("executiveDashboard.summary.title")}
          subtitle={t("executiveDashboard.summary.subtitle")}
          insights={viewModel.insights}
          executiveSummary={viewModel.executiveSummary}
          resolveHealthLabel={resolveHealthLabel}
          resolveHealthStatus={resolveHealthStatus}
          winsLabel={t("executiveDashboard.summary.topWins")}
          risksLabel={t("executiveDashboard.summary.topRisks")}
          immediateActionsLabel={t("executiveDashboard.summary.immediateActions")}
          longTermLabel={t("executiveDashboard.summary.longTermOpportunities")}
          aiPreparedLabel={t("executiveDashboard.summary.aiPrepared")}
          onActionNavigate={(action) => navigate(actionHref(action))}
        />
      </div>

      <QuickActions
        title={t("executiveDashboard.actions.title")}
        actions={viewModel.quickActions}
        resolveLabel={resolveActionLabel}
        canRun={canRunAction}
        onAction={(action) => navigate(action.path)}
      />
    </div>
  );
});

export function ExecutiveDashboardPageContainer() {
  const { t } = useTranslation("common");
  const { company, profile } = useAuth();
  const { identity } = useCompanyIdentity(Boolean(company?.id ?? profile?.company_id));
  const companyName = identity?.name ?? t("executiveDashboard.defaultCompany");

  if (!profile?.company_id) {
    return (
      <DashboardEmpty
        title={t("executiveDashboard.noCompanyTitle")}
        description={t("executiveDashboard.noCompanyBody")}
      />
    );
  }

  return <ExecutiveDashboard companyName={companyName} />;
}
