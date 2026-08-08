import { format } from "date-fns";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Activity,
  ArrowRight,
  Coins,
  Download,
  DollarSign,
  Users,
  CalendarDays,
  FileText,
  BarChart3,
  PieChart,
} from "lucide-react";
import { useLocation } from "wouter";
import { queryShellStateFromQuery } from "@/lib/react-query/query-shell-state";
import { QueryRefreshIndicator } from "@/components/ui/query-refresh-indicator";
import { useCustomers } from "@/hooks/use-customers";
import { useBookings } from "@/hooks/use-bookings";
import { useInvoices } from "@/hooks/use-invoices";
import { useHasPermission, useAuthUser } from "@/hooks/use-rbac";
import { getDashboardRouteById } from "@/config/dashboard-route-registry";
import type { Booking, Invoice } from "@/lib/types";
import { useTranslation } from "react-i18next";
import {
  DashboardCard,
  DashboardStatCard,
} from "@/components/dashboard/ui";
import { useAuth } from "@/context/auth-context";
import { useCompanyLocaleContext } from "@/context/company-locale-context";
import { BranchSelector } from "@/lib/company/branches/components";
import { useBranches } from "@/lib/company/branches/hooks";
import { useAnalyticsFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { isAnalyticsRouteAccessible } from "@/lib/platform-ai/analytics-access";

export default function ReportsPage() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { formatCurrency } = useCompanyLocaleContext();
  const [branchFilter, setBranchFilter] = useState<string | null>(null);
  const { data: branches = [] } = useBranches(companyId);
  const canViewReports = useHasPermission("reports.view");
  const { isSuperAdmin, hasPermission } = useAuthUser();
  const { resolvedEnabled: analyticsFeatureEnabled } = useAnalyticsFeatureEnabled();
  const canViewAiAnalytics = isAnalyticsRouteAccessible({
    isSuperAdmin,
    hasPermission,
    analyticsFeatureEnabled,
  });
  const canViewAiUsage = useHasPermission("ai.costs.view");
  const customersQuery = useCustomers();
  const bookingsQuery = useBookings();
  const invoicesQuery = useInvoices();
  const customers = customersQuery.data ?? [];
  const allBookings = bookingsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const loading =
    queryShellStateFromQuery(customersQuery).isInitialLoad
    || queryShellStateFromQuery(bookingsQuery).isInitialLoad
    || queryShellStateFromQuery(invoicesQuery).isInitialLoad;
  const backgroundRefresh =
    queryShellStateFromQuery(customersQuery).isBackgroundRefresh
    || queryShellStateFromQuery(bookingsQuery).isBackgroundRefresh
    || queryShellStateFromQuery(invoicesQuery).isBackgroundRefresh;

  const bookings = useMemo(() => {
    if (!branchFilter) return allBookings;
    return allBookings.filter((booking: Booking) => booking.location_id === branchFilter);
  }, [allBookings, branchFilter]);

  const totalRevenue  = invoices.filter((invoice: Invoice) => invoice.status === "Paid").reduce<number>((sum: number, invoice: Invoice) => sum + Number(invoice.amount), 0);
  const totalBilled   = invoices.reduce<number>((sum: number, invoice: Invoice) => sum + Number(invoice.amount), 0);
  const fmt = (n: number) => formatCurrency(n);

  const paid    = invoices.filter((invoice: Invoice) => invoice.status === "Paid").reduce<number>((sum: number, invoice: Invoice) => sum + Number(invoice.amount), 0);
  const unpaid  = invoices.filter((invoice: Invoice) => invoice.status === "Unpaid").reduce<number>((sum: number, invoice: Invoice) => sum + Number(invoice.amount), 0);
  const overdue = invoices.filter((invoice: Invoice) => invoice.status === "Overdue").reduce<number>((sum: number, invoice: Invoice) => sum + Number(invoice.amount), 0);
  const breakdown = [
    { label: t("status.paid"), pct: totalBilled > 0 ? Math.round(paid / totalBilled * 100) : 0, color: "bg-emerald-400" },
    { label: t("status.unpaid"), pct: totalBilled > 0 ? Math.round(unpaid / totalBilled * 100) : 0, color: "bg-amber-400" },
    { label: t("status.overdue"), pct: totalBilled > 0 ? Math.round(overdue / totalBilled * 100) : 0, color: "bg-rose-400" },
  ];

  const months: string[] = [];
  const bookingCounts: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(format(d, "MMM"));
    const count = bookings.filter((booking: Booking) => {
      const bd = new Date(booking.booking_date);
      return bd.getMonth() === d.getMonth() && bd.getFullYear() === d.getFullYear();
    }).length;
    bookingCounts.push(count);
  }
  const maxCount = Math.max(...bookingCounts, 1);

  if (!canViewReports) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("dashboard.reports.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dashboard.reports.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <QueryRefreshIndicator active={backgroundRefresh} />
          <div className="min-w-[180px]">
            <BranchSelector
              branches={branches}
              value={branchFilter}
              onChange={setBranchFilter}
              allowAll
              placeholder={t("branches.selector.allBranches")}
            />
          </div>
          <Button variant="outline" className="border-white/10 gap-2">
            <Download className="w-4 h-4" /> {t("buttons.exportReport")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardStatCard label={t("dashboard.reports.stats.revenue")}   value={fmt(totalRevenue)} icon={DollarSign}   loading={loading} />
        <DashboardStatCard label={t("dashboard.reports.stats.customers")} value={customers.length}  icon={Users}        loading={loading} />
        <DashboardStatCard label={t("dashboard.reports.stats.bookings")}  value={bookings.length}   icon={CalendarDays} loading={loading} />
        <DashboardStatCard label={t("dashboard.reports.stats.invoices")}  value={invoices.length}   icon={FileText}     loading={loading} />
      </div>

      {(canViewAiAnalytics || canViewAiUsage) && (
        <DashboardCard className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="font-semibold">{t("dashboard.reports.aiInsightsTitle")}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t("dashboard.reports.aiInsightsSubtitle")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canViewAiAnalytics && (
                <Button
                  variant="outline"
                  className="border-white/10 gap-2"
                  onClick={() => setLocation(getDashboardRouteById("ai-analytics").nestedPath)}
                >
                  <Activity className="w-4 h-4" />
                  {t("dashboard.reports.viewAiAnalytics")}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              )}
              {canViewAiUsage && (
                <Button
                  variant="outline"
                  className="border-white/10 gap-2"
                  onClick={() => setLocation(getDashboardRouteById("ai-usage").nestedPath)}
                >
                  <Coins className="w-4 h-4" />
                  {t("dashboard.reports.viewAiUsage")}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </DashboardCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <DashboardCard className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> {t("dashboard.reports.bookingsPerMonth")}
            </h3>
            <span className="text-xs text-muted-foreground font-mono">{t("dashboard.reports.lastMonths")}</span>
          </div>
          {loading ? (
            <div className="h-40 flex items-end gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex-1 bg-white/5 rounded-t-lg animate-pulse" style={{ height: `${30 + Math.random() * 70}%` }} />
              ))}
            </div>
          ) : (
            <div className="flex items-end gap-3 h-40">
              {bookingCounts.map((val, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground hidden sm:block">{val}</span>
                  <div
                    className="w-full rounded-t-lg transition-all"
                    style={{
                      height: `${(val / maxCount) * 120}px`,
                      minHeight: val > 0 ? 4 : 0,
                      background: i === 6
                        ? "linear-gradient(to top, hsl(190,90%,40%), hsl(190,90%,60%))"
                        : "rgba(255,255,255,0.07)",
                      border: i === 6
                        ? "1px solid hsl(190,90%,50%,0.4)"
                        : "1px solid rgba(255,255,255,0.06)",
                    }}
                  />
                  <span className="text-xs text-muted-foreground">{months[i]}</span>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard className="p-6">
          <h3 className="font-semibold mb-6 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-primary" /> {t("dashboard.reports.invoiceBreakdown")}
          </h3>
          {loading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
                  <div className="h-2 bg-white/5 rounded-full" />
                </div>
              ))}
            </div>
          ) : totalBilled === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("dashboard.reports.noInvoices")}</p>
          ) : (
            <div className="space-y-4">
              {breakdown.map(item => (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span>{item.label}</span>
                    <span className="font-mono text-muted-foreground">{item.pct}%</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
