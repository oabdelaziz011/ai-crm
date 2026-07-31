import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { formatExecutiveDate, DashboardHeader } from "@/components/executive-dashboard/dashboard-header";
import { KpiGrid } from "@/components/executive-dashboard/kpi-grid";
import { AnalyticsGrid } from "@/components/executive-dashboard/analytics-grid";
import { ActivityFeed } from "@/components/executive-dashboard/activity-feed";
import { ExecutiveSummaryCard } from "@/components/executive-dashboard/executive-summary-card";
import { QuickActions } from "@/components/executive-dashboard/quick-actions";
import {
  DashboardEmpty,
  DashboardError,
  DashboardLoading,
} from "@/components/executive-dashboard/dashboard-states";
import { Button } from "@/components/ui/button";
import {
  useDashboardSnapshot,
  useRefreshDashboardSnapshot,
  type DashboardTimeRange,
  type ExecutiveAnalyticsCardModel,
  type ExecutiveActivityItemModel,
  type ExecutiveKpiCardModel,
  type ExecutiveQuickActionModel,
} from "@/lib/dashboard";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";

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

  const handleRefresh = useCallback(() => {
    void refetch();
    if (companyId) refreshDashboard(companyId, timeRange);
  }, [companyId, refetch, refreshDashboard, timeRange]);

  const filteredKpis = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return viewModel.kpis;
    return viewModel.kpis.filter((item) => t(item.titleKey).toLowerCase().includes(query));
  }, [searchValue, t, viewModel.kpis]);

  if (!canView) {
    return (
      <DashboardEmpty
        title={t("executiveDashboard.noPermissionTitle")}
        description={t("executiveDashboard.noPermissionBody")}
      />
    );
  }

  if (isLoading && !viewModel.hasMetrics) {
    return <DashboardLoading label={t("executiveDashboard.loading")} />;
  }

  if (isError) {
    return (
      <div className="space-y-4 p-6">
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
        <DashboardHeader
          companyName={companyName}
          dateLabel={formatExecutiveDate(new Date())}
          title={t("executiveDashboard.title")}
          subtitle={t("executiveDashboard.subtitle")}
          timeRange={timeRange}
          timeRangeLabel={t("executiveDashboard.timeRange.label")}
          searchPlaceholder={t("executiveDashboard.searchPlaceholder")}
          searchValue={searchValue}
          refreshLabel={t("executiveDashboard.refresh")}
          filterLabel={t("executiveDashboard.filter")}
          isRefreshing={isFetching}
          onTimeRangeChange={setTimeRange}
          onSearchChange={setSearchValue}
          onRefresh={handleRefresh}
          timeRangeOptions={timeRangeOptions}
        />
        <DashboardEmpty
          title={t("executiveDashboard.emptyTitle")}
          description={t("executiveDashboard.emptyBody")}
          action={
            <Button variant="outline" onClick={handleRefresh}>
              {t("executiveDashboard.refresh")}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <DashboardHeader
        companyName={companyName}
        dateLabel={formatExecutiveDate(new Date())}
        title={t("executiveDashboard.title")}
        subtitle={t("executiveDashboard.subtitle")}
        timeRange={timeRange}
        timeRangeLabel={t("executiveDashboard.timeRange.label")}
        searchPlaceholder={t("executiveDashboard.searchPlaceholder")}
        searchValue={searchValue}
        refreshLabel={t("executiveDashboard.refresh")}
        filterLabel={t("executiveDashboard.filter")}
        isRefreshing={isFetching}
        onTimeRangeChange={setTimeRange}
        onSearchChange={setSearchValue}
        onRefresh={handleRefresh}
        timeRangeOptions={timeRangeOptions}
      />

      <KpiGrid
        items={filteredKpis}
        resolveTitle={resolveKpiTitle}
        comparisonLabel={t("executiveDashboard.vsPreviousPeriod")}
        emptyLabel={t("executiveDashboard.kpi.empty")}
        errorLabel={t("executiveDashboard.kpi.error")}
      />

      <AnalyticsGrid
        items={viewModel.analytics}
        resolveTitle={resolveAnalyticsTitle}
        resolveSubtitle={resolveAnalyticsSubtitle}
        emptyLabel={t("executiveDashboard.analytics.noData")}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <ActivityFeed
          items={viewModel.activities}
          title={t("executiveDashboard.activity.title")}
          emptyLabel={t("executiveDashboard.activity.empty")}
          loading={isLoading}
          loadMoreLabel={t("executiveDashboard.activity.loadMore")}
          resolveTitle={resolveActivityTitle}
        />
        <ExecutiveSummaryCard
          title={t("executiveDashboard.summary.title")}
          subtitle={t("executiveDashboard.summary.subtitle")}
          insights={viewModel.insights}
          executiveSummary={viewModel.executiveSummary}
          resolveHealthLabel={resolveHealthLabel}
          winsLabel={t("executiveDashboard.summary.topWins")}
          risksLabel={t("executiveDashboard.summary.topRisks")}
          immediateActionsLabel={t("executiveDashboard.summary.immediateActions")}
          longTermLabel={t("executiveDashboard.summary.longTermOpportunities")}
          aiPreparedLabel={t("executiveDashboard.summary.aiPrepared")}
        />
      </div>

      <QuickActions
        title={t("executiveDashboard.actions.title")}
        actions={viewModel.quickActions}
        resolveLabel={resolveActionLabel}
        canRun={canRunAction}
        onAction={(action) => setLocation(action.path)}
      />
    </div>
  );
});

export function ExecutiveDashboardPageContainer() {
  const { t } = useTranslation("common");
  const { company, profile } = useAuth();
  const companyName = company?.name ?? t("executiveDashboard.defaultCompany");

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
