import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  DollarSign,
  FileText,
  Lightbulb,
  Percent,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Activity,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useCompanyIdentity } from "@/hooks/company-workspace/use-company-identity";
import { useCustomers } from "@/hooks/use-customers";
import { useBookings } from "@/hooks/use-bookings";
import { useInvoices } from "@/hooks/use-invoices";
import { useAuthUser } from "@/hooks/use-rbac";
import { useCurrentUserBranches } from "@/lib/company/branches/hooks";
import { useAppShell } from "@/context/app-shell-context";
import { getDashboardRouteById } from "@/config/dashboard-route-registry";
import { CustomerModal } from "@/components/dashboard/customer-modal";
import { BookingModal } from "@/components/dashboard/booking-modal";
import { InvoiceModal } from "@/components/dashboard/invoice-modal";
import { Can } from "@/components/rbac/permission-guard";
import { Button } from "@/components/ui/button";
import {
  DashboardCard,
  DashboardErrorBanner,
} from "@/components/dashboard/ui";
import { ExecutiveKpiCard, ExecutiveKpiSkeleton } from "@/components/dashboard/executive/executive-kpi-card";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";

const ExecutiveTrendChart = lazy(() =>
  import("@/components/dashboard/executive/executive-trend-chart").then((module) => ({
    default: module.ExecutiveTrendChart,
  })),
);
import {
  buildActivityTimeline,
  buildMonthBuckets,
  bookingsPreviousMonth,
  bookingsThisMonth,
  comparePeriods,
  conversionRate,
  conversionRatePrevious,
  deriveAiInsight,
  derivePrimaryAction,
  fmtCurrency,
  missedAppointments,
  monthlyBookings,
  monthlyCollections,
  monthlyCustomerGrowth,
  monthlyRevenue,
  newCustomersPreviousMonth,
  newCustomersThisMonth,
  outstandingAmount,
  outstandingCount,
  outstandingInvoiceTrend,
  pendingBookings,
  revenuePreviousMonth,
  revenueThisMonth,
  todayBookingsList,
  utilizationRate,
  utilizationWeekTrend,
  waitingCustomersToday,
  type ExecutiveKpiId,
} from "@/lib/dashboard/executive-metrics";
import type { Booking } from "@/lib/types";
import { queryShellStateFromQuery } from "@/lib/react-query/query-shell-state";
import { QueryRefreshIndicator } from "@/components/ui/query-refresh-indicator";
import { cn } from "@/lib/utils";

export function DashboardHomePage() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { displayName, company, profile } = useAuth();
  const { identity } = useCompanyIdentity(Boolean(company?.id ?? profile?.company_id));
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { setCopilotOpen } = useAppShell();
  const companyId = profile?.company_id ?? null;

  const canViewCustomers = isSuperAdmin || hasPermission("customers.view");
  const canViewBookings = isSuperAdmin || hasPermission("bookings.view");
  const canViewInvoices = isSuperAdmin || hasPermission("invoices.view");
  const canViewReports = isSuperAdmin || hasPermission("reports.view");
  const canCreateCustomer = isSuperAdmin || hasPermission("customers.create");
  const canCreateBooking = isSuperAdmin || hasPermission("bookings.create");
  const canCreateInvoice = isSuperAdmin || hasPermission("invoices.create");

  const customersQuery = useCustomers();
  const bookingsQuery = useBookings();
  const invoicesQuery = useInvoices();
  const customers = customersQuery.data ?? [];
  const bookings = bookingsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const customersError = customersQuery.error;
  const bookingsError = bookingsQuery.error;
  const invoicesError = invoicesQuery.error;

  const customersShell = queryShellStateFromQuery(customersQuery);
  const bookingsShell = queryShellStateFromQuery(bookingsQuery);
  const invoicesShell = queryShellStateFromQuery(invoicesQuery);
  const initialLoad =
    customersShell.isInitialLoad || bookingsShell.isInitialLoad || invoicesShell.isInitialLoad;
  const backgroundRefresh =
    customersShell.isBackgroundRefresh
    || bookingsShell.isBackgroundRefresh
    || invoicesShell.isBackgroundRefresh;
  const { data: userBranches = [] } = useCurrentUserBranches(companyId);

  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);

  const errors = [customersError, bookingsError, invoicesError].filter(Boolean);

  const now = useMemo(() => new Date(), []);
  const monthBuckets = useMemo(() => buildMonthBuckets(now), [now]);

  const branchLabel = useMemo(() => {
    if (userBranches.length === 0) return t("dashboard.home.executive.allBranches");
    const primary = userBranches.find((b) => b.is_primary) ?? userBranches[0];
    return userBranches.length > 1
      ? t("dashboard.home.executive.branchWithCount", { name: primary.name, count: userBranches.length })
      : primary.name;
  }, [userBranches, t]);

  const metrics = useMemo(() => {
    const revCurrent = revenueThisMonth(invoices, now);
    const revPrev = revenuePreviousMonth(invoices, now);
    const bookCurrent = bookingsThisMonth(bookings, now);
    const bookPrev = bookingsPreviousMonth(bookings, now);
    const custCurrent = newCustomersThisMonth(customers, now);
    const custPrev = newCustomersPreviousMonth(customers, now);
    const convCurrent = conversionRate(bookings, now);
    const convPrev = conversionRatePrevious(bookings, now);
    const outstanding = outstandingCount(invoices);
    const outstandingAmt = outstandingAmount(invoices);
    const util = utilizationRate(bookings, now);
    const utilTrend = utilizationWeekTrend(bookings, now);
    const outstandingTrend = outstandingInvoiceTrend(invoices, now);

    return {
      revenue: comparePeriods(revCurrent, revPrev),
      bookings: comparePeriods(bookCurrent, bookPrev),
      customers: comparePeriods(custCurrent, custPrev),
      outstanding: outstandingTrend,
      conversion: comparePeriods(convCurrent, convPrev),
      utilization: utilTrend,
      revCurrent,
      bookCurrent,
      custCurrent,
      convCurrent,
      util,
      outstandingCount: outstanding,
      outstandingAmt,
      pending: pendingBookings(bookings).length,
    };
  }, [bookings, customers, invoices, now]);

  const charts = useMemo(
    () => ({
      revenue: monthlyRevenue(invoices, monthBuckets),
      bookings: monthlyBookings(bookings, monthBuckets),
      customers: monthlyCustomerGrowth(customers, monthBuckets),
      collections: monthlyCollections(invoices, monthBuckets),
    }),
    [bookings, customers, invoices, monthBuckets],
  );

  const operations = useMemo(
    () => ({
      today: todayBookingsList(bookings, now),
      pending: pendingBookings(bookings).slice(0, 5),
      waiting: waitingCustomersToday(bookings, now),
      missed: missedAppointments(bookings, now),
    }),
    [bookings, now],
  );

  const aiInsight = useMemo(
    () => deriveAiInsight(bookings, invoices, customers, now),
    [bookings, invoices, customers, now],
  );

  const activity = useMemo(
    () => buildActivityTimeline(customers, bookings, invoices, 10),
    [customers, bookings, invoices],
  );

  const primaryAction = derivePrimaryAction(
    metrics.pending,
    metrics.outstandingCount,
    canCreateBooking,
  );

  const hour = now.getHours();
  const greetingKey =
    hour < 12
      ? "dashboard.home.greetingMorning"
      : hour < 17
        ? "dashboard.home.greetingAfternoon"
        : "dashboard.home.greetingEvening";

  const comparisonLabel = t("dashboard.home.executive.vsLastMonth");

  const kpiDrillDown: Record<ExecutiveKpiId, string> = {
    revenue: getDashboardRouteById("reports").nestedPath,
    bookings: getDashboardRouteById("bookings").nestedPath,
    customers: getDashboardRouteById("customers").nestedPath,
    outstanding: getDashboardRouteById("invoices").nestedPath,
    conversion: getDashboardRouteById("bookings").nestedPath,
    utilization: getDashboardRouteById("calendar").nestedPath,
  };

  const kpiDefinitions = useMemo(() => {
    const items: Array<{
      id: ExecutiveKpiId;
      visible: boolean;
      label: string;
      value: string | number;
      icon: typeof DollarSign;
      trend: ReturnType<typeof comparePeriods>;
    }> = [];

    if (canViewReports || canViewInvoices) {
      items.push({
        id: "revenue",
        visible: true,
        label: t("dashboard.reports.stats.revenue"),
        value: fmtCurrency(metrics.revCurrent),
        icon: DollarSign,
        trend: metrics.revenue,
      });
    }
    if (canViewBookings) {
      items.push({
        id: "bookings",
        visible: true,
        label: t("dashboard.bookings.stats.total"),
        value: metrics.bookCurrent,
        icon: CalendarDays,
        trend: metrics.bookings,
      });
    }
    if (canViewCustomers) {
      items.push({
        id: "customers",
        visible: true,
        label: t("dashboard.customers.stats.newMonth"),
        value: metrics.custCurrent,
        icon: Users,
        trend: metrics.customers,
      });
    }
    if (canViewInvoices) {
      items.push({
        id: "outstanding",
        visible: true,
        label: t("dashboard.invoices.stats.outstanding"),
        value: metrics.outstandingCount,
        icon: AlertCircle,
        trend: metrics.outstanding,
      });
    }
    if (canViewBookings) {
      items.push({
        id: "conversion",
        visible: true,
        label: t("dashboard.home.executive.conversionRate"),
        value: `${metrics.convCurrent}%`,
        icon: Percent,
        trend: metrics.conversion,
      });
      items.push({
        id: "utilization",
        visible: true,
        label: t("dashboard.home.executive.utilization"),
        value: `${metrics.util}%`,
        icon: Activity,
        trend: metrics.utilization,
      });
    }

    return items;
  }, [
    canViewBookings,
    canViewCustomers,
    canViewInvoices,
    canViewReports,
    metrics,
    t,
  ]);

  const handlePrimaryAction = () => {
    if (primaryAction === "pending") setLocation(getDashboardRouteById("bookings").nestedPath);
    else if (primaryAction === "outstanding") setLocation(getDashboardRouteById("invoices").nestedPath);
    else setBookingModalOpen(true);
  };

  const primaryActionKey = `dashboard.home.executive.primaryAction.${primaryAction}`;

  const hasAnySection =
    kpiDefinitions.length > 0
    || canViewReports
    || canViewBookings
    || canViewCustomers
    || canViewInvoices;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {errors.length > 0 && (
        <DashboardErrorBanner message={errors.map((e) => e!.message).join(" · ")} />
      )}

      {/* SECTION 1 — Executive Hero (compact) */}
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card px-5 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            <span>{format(now, "EEEE, MMM d, yyyy")}</span>
            {identity?.name && (
              <>
                <span className="text-border">·</span>
                <span className="text-foreground/80">{identity.name}</span>
              </>
            )}
            <span className="text-border">·</span>
            <span>{branchLabel}</span>
          </div>
          <h1 className="mt-1 truncate text-xl font-bold tracking-tight md:text-2xl">
            {t(greetingKey, {
              name: displayName,
              defaultValue: t("dashboard.home.greeting", { name: displayName }),
            })}
          </h1>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:max-w-md lg:items-end">
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 lg:w-full">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("dashboard.home.executive.dailyInsight", {
                insight: t(aiInsight.bodyKey, {
                  ...aiInsight.bodyParams,
                  defaultValue: t("dashboard.home.executive.dailyInsightFallback"),
                }),
              })}
            </p>
          </div>
          <Button size="sm" className="shrink-0 gap-2" onClick={handlePrimaryAction}>
            {t(primaryActionKey)}
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </section>

      {!hasAnySection ? (
        <DashboardCard className="p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("dashboard.home.noSections")}</p>
        </DashboardCard>
      ) : (
        <>
          {/* SECTION 2 — Primary KPIs */}
          {kpiDefinitions.length > 0 && (
            <section>
          <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("dashboard.home.executive.kpiTitle")}
                </h2>
                <QueryRefreshIndicator active={backgroundRefresh} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                {initialLoad
                  ? Array.from({ length: Math.min(6, kpiDefinitions.length || 4) }).map((_, i) => (
                      <ExecutiveKpiSkeleton key={i} />
                    ))
                  : kpiDefinitions.map((kpi) => (
                      <ExecutiveKpiCard
                        key={kpi.id}
                        label={kpi.label}
                        value={kpi.value}
                        icon={kpi.icon}
                        trend={kpi.trend}
                        comparisonLabel={comparisonLabel}
                        onClick={() => setLocation(kpiDrillDown[kpi.id])}
                      />
                    ))}
              </div>
            </section>
          )}

          {/* SECTION 3 — Business Overview Charts */}
          {(canViewReports || canViewInvoices || canViewBookings || canViewCustomers) && (
            <section>
              <div className="mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("dashboard.home.executive.chartsTitle")}
                </h2>
              </div>
              <Suspense fallback={<DashboardPageFallback />}>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {(canViewReports || canViewInvoices) && (
                  <ExecutiveTrendChart
                    chartId="revenue"
                    title={t("dashboard.home.executive.revenueTrend")}
                    subtitle={t("dashboard.home.executive.revenueTrendSub")}
                    icon={<TrendingUp className="size-4 text-primary" />}
                    data={charts.revenue}
                    loading={initialLoad}
                    valueFormatter={fmtCurrency}
                    emptyLabel={t("dashboard.home.executive.noChartData")}
                  />
                )}
                {canViewBookings && (
                  <ExecutiveTrendChart
                    chartId="bookings"
                    title={t("dashboard.home.executive.bookingsTrend")}
                    subtitle={t("dashboard.home.executive.bookingsTrendSub")}
                    icon={<CalendarDays className="size-4 text-primary" />}
                    data={charts.bookings}
                    loading={initialLoad}
                    emptyLabel={t("dashboard.home.executive.noChartData")}
                  />
                )}
                {canViewCustomers && (
                  <ExecutiveTrendChart
                    chartId="customers"
                    title={t("dashboard.home.executive.customerGrowth")}
                    subtitle={t("dashboard.home.executive.customerGrowthSub")}
                    icon={<Users className="size-4 text-primary" />}
                    data={charts.customers}
                    loading={initialLoad}
                    emptyLabel={t("dashboard.home.executive.noChartData")}
                    color="hsl(var(--success))"
                  />
                )}
                {canViewInvoices && (
                  <ExecutiveTrendChart
                    chartId="collections"
                    title={t("dashboard.home.executive.collections")}
                    subtitle={t("dashboard.home.executive.collectionsSub")}
                    data={charts.collections}
                    loading={initialLoad}
                    valueFormatter={(v) => `${v}%`}
                    emptyLabel={t("dashboard.home.executive.noChartData")}
                    color="hsl(38 92% 50%)"
                  />
                )}
              </div>
              </Suspense>
            </section>
          )}

          {/* SECTION 4 + 5 — Operations & AI Insight */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {canViewBookings && (
              <section className="xl:col-span-2">
                <div className="mb-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {t("dashboard.home.executive.operationsTitle")}
                  </h2>
                </div>
                <DashboardCard className="divide-y divide-border overflow-hidden">
                  <OperationsRow
                    label={t("dashboard.home.executive.todayBookings")}
                    count={operations.today.length}
                    loading={initialLoad}
                    empty={t("dashboard.home.executive.noTodayBookings")}
                  >
                    {operations.today.slice(0, 4).map((b: Booking) => (
                      <MiniRow
                        key={b.id}
                        title={b.customers?.name ?? b.service}
                        meta={format(new Date(b.booking_date), "h:mm a")}
                        badge={b.status}
                      />
                    ))}
                  </OperationsRow>
                  <OperationsRow
                    label={t("dashboard.home.executive.pendingApprovals")}
                    count={operations.pending.length}
                    loading={initialLoad}
                    empty={t("dashboard.home.executive.noPending")}
                  >
                    {operations.pending.slice(0, 3).map((b: Booking) => (
                      <MiniRow
                        key={b.id}
                        title={b.customers?.name ?? b.service}
                        meta={format(new Date(b.booking_date), "MMM d")}
                        badge={b.status}
                      />
                    ))}
                  </OperationsRow>
                  <OperationsRow
                    label={t("dashboard.home.executive.waitingCustomers")}
                    count={operations.waiting.length}
                    loading={initialLoad}
                    empty={t("dashboard.home.executive.noWaiting")}
                  >
                    {operations.waiting.slice(0, 3).map((b: Booking) => (
                      <MiniRow
                        key={b.id}
                        title={b.customers?.name ?? b.service}
                        meta={format(new Date(b.booking_date), "h:mm a")}
                        badge="Waiting"
                      />
                    ))}
                  </OperationsRow>
                  <OperationsRow
                    label={t("dashboard.home.executive.missedAppointments")}
                    count={operations.missed.length}
                    loading={initialLoad}
                    empty={t("dashboard.home.executive.noMissed")}
                  >
                    {operations.missed.slice(0, 3).map((b: Booking) => (
                      <MiniRow
                        key={b.id}
                        title={b.customers?.name ?? b.service}
                        meta={format(new Date(b.booking_date), "h:mm a")}
                        badge={b.status}
                      />
                    ))}
                  </OperationsRow>
                </DashboardCard>
              </section>
            )}

            <section className={cn(!canViewBookings && "xl:col-span-3")}>
              <div className="mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("dashboard.home.executive.aiInsightTitle")}
                </h2>
              </div>
              <DashboardCard className="h-full p-5">
                <div
                  className={cn(
                    "mb-4 flex size-10 items-center justify-center rounded-lg",
                    aiInsight.severity === "warning" && "bg-warning/15 text-warning",
                    aiInsight.severity === "success" && "bg-success/15 text-success",
                    aiInsight.severity === "info" && "bg-primary/15 text-primary",
                  )}
                >
                  <Lightbulb className="size-5" />
                </div>
                <h3 className="text-base font-semibold">
                  {t(aiInsight.titleKey)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(aiInsight.bodyKey, aiInsight.bodyParams)}
                </p>
                {metrics.outstandingAmt > 0 && canViewInvoices && (
                  <p className="mt-4 font-mono text-lg font-semibold tabular-nums text-foreground">
                    {fmtCurrency(metrics.outstandingAmt)}
                    <span className="ms-2 text-xs font-normal text-muted-foreground">
                      {t("dashboard.home.executive.atRisk")}
                    </span>
                  </p>
                )}
              </DashboardCard>
            </section>
          </div>

          {/* SECTION 6 — Quick Actions */}
          <section>
            <div className="mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t("dashboard.home.executive.quickActionsTitle")}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Can permission="customers.create">
                <QuickActionButton
                  icon={UserPlus}
                  label={t("buttons.addCustomer")}
                  onClick={() => setCustomerModalOpen(true)}
                />
              </Can>
              <Can permission="bookings.create">
                <QuickActionButton
                  icon={CalendarPlus}
                  label={t("buttons.newBooking")}
                  onClick={() => setBookingModalOpen(true)}
                />
              </Can>
              <Can permission="invoices.create">
                <QuickActionButton
                  icon={FileText}
                  label={t("buttons.newInvoice")}
                  onClick={() => setInvoiceModalOpen(true)}
                />
              </Can>
              <QuickActionButton
                icon={Sparkles}
                label={t("appShell.commandPalette.askAi")}
                onClick={() => setCopilotOpen(true)}
              />
            </div>
          </section>

          {/* SECTION 7 — Recent Activity */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t("dashboard.home.executive.activityTitle")}
              </h2>
            </div>
            <DashboardCard className="overflow-hidden">
              {initialLoad ? (
                <div className="divide-y divide-border">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-4">
                      <div className="size-8 animate-pulse rounded-full bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                        <div className="h-2.5 w-24 animate-pulse rounded bg-muted/60" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activity.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                  {t("dashboard.home.executive.noActivity")}
                </p>
              ) : (
                <div className="relative divide-y divide-border">
                  <div className="absolute start-[29px] top-4 bottom-4 w-px bg-border" aria-hidden="true" />
                  {activity.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLocation(item.href)}
                      className="relative flex w-full items-start gap-4 px-5 py-4 text-start transition-colors hover:bg-muted/30"
                    >
                      <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                        {item.type === "customer" && <Users className="size-3.5 text-primary" />}
                        {item.type === "booking" && <CalendarDays className="size-3.5 text-primary" />}
                        {item.type === "invoice" && <DollarSign className="size-3.5 text-primary" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t(`dashboard.home.executive.activity.${item.type}`, { status: item.subtitle })}
                          {" · "}
                          {format(new Date(item.timestamp), "MMM d, h:mm a")}
                        </p>
                      </div>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              )}
            </DashboardCard>
          </section>
        </>
      )}

      <CustomerModal open={customerModalOpen} onClose={() => setCustomerModalOpen(false)} />
      <BookingModal
        open={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        customers={customers}
        companyId={companyId}
      />
      <InvoiceModal
        open={invoiceModalOpen}
        onClose={() => setInvoiceModalOpen(false)}
        customers={customers}
      />
    </div>
  );
}

function OperationsRow({
  label,
  count,
  loading,
  empty,
  children,
}: {
  label: string;
  count: number;
  loading?: boolean;
  empty: string;
  children: ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        {loading ? (
          <div className="h-5 w-8 animate-pulse rounded bg-muted" />
        ) : (
          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold tabular-nums">
            {count}
          </span>
        )}
      </div>
      {!loading && count === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">{empty}</p>
      )}
      {count > 0 && <div className="mt-2 space-y-1">{children}</div>}
    </div>
  );
}

function MiniRow({
  title,
  meta,
  badge,
}: {
  title: string;
  meta: string;
  badge: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{title}</p>
        <p className="text-[11px] text-muted-foreground">{meta}</p>
      </div>
      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {badge}
      </span>
    </div>
  );
}

function QuickActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof UserPlus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-5 text-center transition-all hover:border-primary/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="size-[18px] text-primary" />
      </div>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
