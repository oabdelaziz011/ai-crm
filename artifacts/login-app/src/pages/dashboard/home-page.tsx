import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Clock,
  DollarSign,
  LayoutDashboard,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useCustomers } from "@/hooks/use-customers";
import { useBookings } from "@/hooks/use-bookings";
import { useInvoices } from "@/hooks/use-invoices";
import { useAuthUser } from "@/hooks/use-rbac";
import type { Booking, Invoice } from "@/lib/types";
import { useTranslation } from "react-i18next";
import {
  DASHBOARD_SIDEBAR_GROUPS,
  DASHBOARD_SIDEBAR_ORDER,
  getDashboardRouteById,
  isDashboardRoutePermitted,
  type DashboardRouteDefinition,
  type DashboardSectionId,
} from "@/config/dashboard-route-registry";
import {
  DashboardCard,
  DashboardStatCard,
} from "@/components/dashboard/ui";

function collectPermittedRoutes(
  isSuperAdmin: boolean,
  hasPermission: (permission: string) => boolean,
): DashboardRouteDefinition[] {
  const routes: DashboardRouteDefinition[] = [];

  for (const entry of DASHBOARD_SIDEBAR_ORDER) {
    if (entry.type === "group") {
      const group = DASHBOARD_SIDEBAR_GROUPS.find((item) => item.id === entry.id);
      if (!group) {
        continue;
      }
      for (const childId of group.childIds) {
        const route = getDashboardRouteById(childId);
        if (isDashboardRoutePermitted(route, isSuperAdmin, hasPermission)) {
          routes.push(route);
        }
      }
      continue;
    }

    const route = getDashboardRouteById(entry.id);
    if (isDashboardRoutePermitted(route, isSuperAdmin, hasPermission)) {
      routes.push(route);
    }
  }

  return routes;
}

export function DashboardHomePage() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { displayName, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();

  const canViewCustomers = isSuperAdmin || hasPermission("customers.view");
  const canViewBookings = isSuperAdmin || hasPermission("bookings.view");
  const canViewInvoices = isSuperAdmin || hasPermission("invoices.view");
  const canViewReports = isSuperAdmin || hasPermission("reports.view");

  const { data: customers = [], isLoading: customersLoading } = useCustomers();
  const { data: bookings = [], isLoading: bookingsLoading } = useBookings();
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices();

  const permittedRoutes = useMemo(
    () => collectPermittedRoutes(isSuperAdmin, hasPermission),
    [hasPermission, isSuperAdmin],
  );

  const todayBookings = bookings.filter((booking: Booking) => {
    const bookingDate = new Date(booking.booking_date);
    const now = new Date();
    return (
      bookingDate.getFullYear() === now.getFullYear()
      && bookingDate.getMonth() === now.getMonth()
      && bookingDate.getDate() === now.getDate()
    );
  }).length;

  const pendingBookings = bookings.filter(
    (booking: Booking) => booking.status === "Pending",
  ).length;

  const outstandingInvoices = invoices.filter(
    (invoice: Invoice) => invoice.status === "Unpaid" || invoice.status === "Overdue",
  ).length;

  const totalRevenue = invoices
    .filter((invoice: Invoice) => invoice.status === "Paid")
    .reduce<number>((sum, invoice) => sum + Number(invoice.amount), 0);

  const fmt = (amount: number) =>
    amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  const metricsLoading = customersLoading || bookingsLoading || invoicesLoading;
  const showMetrics = canViewCustomers || canViewBookings || canViewInvoices || canViewReports;

  const navigateToSection = (sectionId: DashboardSectionId) => {
    setLocation(getDashboardRouteById(sectionId).nestedPath);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 shrink-0">
          <LayoutDashboard className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t("dashboard.home.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("dashboard.home.greeting", { name: displayName })}
          </p>
          {company?.name && (
            <p className="text-xs text-muted-foreground mt-1">{company.name}</p>
          )}
        </div>
      </div>

      {showMetrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {canViewCustomers && (
            <DashboardStatCard
              label={t("dashboard.customers.stats.total")}
              value={customers.length}
              icon={Users}
              loading={metricsLoading}
            />
          )}
          {canViewBookings && (
            <>
              <DashboardStatCard
                label={t("dashboard.bookings.stats.today")}
                value={todayBookings}
                icon={CalendarDays}
                loading={metricsLoading}
              />
              <DashboardStatCard
                label={t("dashboard.bookings.stats.pending")}
                value={pendingBookings}
                icon={Clock}
                loading={metricsLoading}
              />
            </>
          )}
          {canViewInvoices && (
            <DashboardStatCard
              label={t("dashboard.invoices.stats.outstanding")}
              value={outstandingInvoices}
              icon={AlertCircle}
              loading={metricsLoading}
            />
          )}
          {canViewReports && (
            <DashboardStatCard
              label={t("dashboard.reports.stats.revenue")}
              value={fmt(totalRevenue)}
              icon={DollarSign}
              loading={metricsLoading}
            />
          )}
        </div>
      )}

      {permittedRoutes.length > 0 ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{t("dashboard.home.quickLinks")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("dashboard.home.quickLinksSubtitle")}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {permittedRoutes.map((route) => {
              const Icon = route.icon;
              return (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => navigateToSection(route.id)}
                  className="text-start group"
                >
                  <DashboardCard className="p-5 h-full hover:bg-card/60 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                    </div>
                    <h3 className="font-semibold mt-4">{t(route.titleKey)}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t(`dashboard.home.sections.${route.id}`, {
                        defaultValue: t("dashboard.home.openSection"),
                      })}
                    </p>
                  </DashboardCard>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <DashboardCard className="p-6">
          <p className="text-sm text-muted-foreground">{t("dashboard.home.noSections")}</p>
        </DashboardCard>
      )}
    </div>
  );
}
