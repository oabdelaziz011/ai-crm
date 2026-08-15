import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  DollarSign,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { CustomerProfileQuickAction, CustomerProfileTab } from "@/components/customer-profile/types";
import { WorkspaceAiInsights } from "@/components/customer-workspace/workspace-ai-insights";
import {
  WorkspaceHealthCard,
  WorkspaceListRow,
  WorkspaceGuidedEmpty,
} from "@/components/customer-workspace/workspace-ui";
import {
  WorkspaceStatusChip,
  WorkspaceTabFrame,
} from "@/components/customer-workspace/workspace-tab-frame";
import {
  buildCustomerActivityTimeline,
  computeCustomerHealth,
  deriveWorkspaceAiInsights,
  filterBookingsForCustomer,
  filterInvoicesForCustomer,
  fmtCurrency,
  fmtDate,
  lastPaidInvoice,
  localizeBookingStatus,
  localizeInvoiceStatus,
  nextUpcomingBooking,
  recentInvoice,
  type WorkspaceAiInsight,
} from "@/lib/customer-workspace/customer-workspace-utils";
import type { Booking, Customer, Invoice } from "@/lib/types";

type Props = {
  customer: Customer;
  onQuickAction: (action: CustomerProfileQuickAction) => void;
  outstanding: number;
  ltv: number;
  bookingsLoading: boolean;
  invoicesLoading: boolean;
  allBookings: Booking[];
  allInvoices: Invoice[];
  onNavigateTab: (tab: CustomerProfileTab) => void;
  aiInsights: WorkspaceAiInsight[];
};

export function WorkspaceOverviewTab({
  customer,
  onQuickAction,
  outstanding,
  ltv,
  bookingsLoading,
  invoicesLoading,
  allBookings,
  allInvoices,
  onNavigateTab,
  aiInsights,
}: Props) {
  const { t, i18n } = useTranslation("common");
  const customerBookings = filterBookingsForCustomer(allBookings, customer.id);
  const customerInvoices = filterInvoicesForCustomer(allInvoices, customer.id);
  const upcoming = nextUpcomingBooking(customerBookings);
  const lastPayment = lastPaidInvoice(customerInvoices);
  const latestInvoice = recentInvoice(customerInvoices);
  const recent = buildCustomerActivityTimeline(customer, customerBookings, customerInvoices, 6);
  const loading = bookingsLoading || invoicesLoading;
  const cancelled = customerBookings.filter((b) => b.status === "Cancelled").length;
  const overdue = customerInvoices.filter((inv) => inv.status === "Overdue").length;
  const health = computeCustomerHealth(ltv, outstanding, cancelled, overdue);
  const lang = i18n.language;

  return (
    <WorkspaceTabFrame
      title={t("dashboard.customerWorkspace.overview.snapshotTitle")}
      subtitle={t("dashboard.customerWorkspace.overview.snapshotSubtitle")}
    >
      <div className="space-y-4 p-4">
        <div className="grid gap-3 lg:grid-cols-12">
          <WorkspaceHealthCard
            className="lg:col-span-4"
            health={health}
            customerName={customer.name}
            subtitle={
              customer.phone || customer.email
                ? [customer.phone, customer.email].filter(Boolean).join(" · ")
                : t("dashboard.customerWorkspace.overview.summaryEmpty")
            }
          />
          <div className="lg:col-span-8">
            <WorkspaceAiInsights
              insights={aiInsights.length ? aiInsights : deriveWorkspaceAiInsights(customer, allBookings, allInvoices)}
              onInsightAction={(insight) => {
                if (insight.actionTab) onNavigateTab(insight.actionTab);
              }}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label={t("dashboard.customerWorkspace.ltv")}
            value={loading ? "—" : fmtCurrency(ltv)}
            icon={DollarSign}
          />
          <StatTile
            label={t("dashboard.customerWorkspace.outstandingShort")}
            value={loading ? "—" : fmtCurrency(outstanding)}
            icon={CreditCard}
            warn={outstanding > 0}
          />
          <StatTile
            label={t("dashboard.customerProfile.metrics.bookings")}
            value={loading ? "—" : String(customerBookings.length)}
            icon={CalendarDays}
          />
          <StatTile
            label={t("dashboard.customerProfile.metrics.invoices")}
            value={loading ? "—" : String(customerInvoices.length)}
            icon={CreditCard}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <section className="rounded-xl border border-border/60 bg-background p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold">{t("dashboard.customerWorkspace.overview.upcomingTitle")}</p>
              <button
                type="button"
                className="text-[11px] font-semibold text-primary"
                onClick={() => onNavigateTab("bookings")}
              >
                {t("dashboard.customerWorkspace.tabs.bookings")}
              </button>
            </div>
            {upcoming ? (
              <button
                type="button"
                onClick={() => onNavigateTab("bookings")}
                className="flex w-full items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5 text-start hover:bg-primary/5"
              >
                <CalendarDays className="size-4 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{upcoming.service}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(upcoming.booking_date, lang)} ·{" "}
                    {localizeBookingStatus(upcoming.scheduling_status ?? upcoming.status, (key) => t(key))}
                  </p>
                </div>
                <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" />
              </button>
            ) : (
              <WorkspaceGuidedEmpty
                icon={CalendarDays}
                title={t("dashboard.customerWorkspace.overview.noUpcoming")}
                description={t("dashboard.customerWorkspace.overview.noUpcomingHint")}
                actionLabel={t("dashboard.customerWorkspace.header.newBooking")}
                onAction={() => onQuickAction("new-booking")}
              />
            )}
          </section>

          <section className="rounded-xl border border-border/60 bg-background p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold">{t("dashboard.customerWorkspace.overview.recentInvoiceTitle")}</p>
              <button
                type="button"
                className="text-[11px] font-semibold text-primary"
                onClick={() => onNavigateTab("invoices")}
              >
                {t("dashboard.customerWorkspace.tabs.invoices")}
              </button>
            </div>
            {latestInvoice ? (
              <WorkspaceListRow
                title={fmtCurrency(Number(latestInvoice.amount))}
                subtitle={fmtDate(latestInvoice.invoice_date, lang)}
                badge={localizeInvoiceStatus(latestInvoice.status, (key) => t(key))}
                onClick={() => onNavigateTab("invoices")}
                compact
              />
            ) : lastPayment ? (
              <WorkspaceListRow
                title={fmtCurrency(Number(lastPayment.amount))}
                subtitle={fmtDate(lastPayment.invoice_date, lang)}
                badge={t("status.paid")}
                onClick={() => onNavigateTab("payments")}
                compact
              />
            ) : (
              <WorkspaceGuidedEmpty
                icon={CreditCard}
                title={t("dashboard.customerWorkspace.invoices.emptyTitle")}
                description={t("dashboard.customerWorkspace.invoices.emptyDescription")}
                actionLabel={t("buttons.newInvoice")}
                onAction={() => onQuickAction("new-invoice")}
              />
            )}
          </section>
        </div>

        <section className="rounded-xl border border-border/60 bg-background p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold">{t("dashboard.customerWorkspace.overview.recentTitle")}</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
              onClick={() => onNavigateTab("timeline")}
            >
              {t("dashboard.customerWorkspace.overview.viewTimeline")}
              <ArrowRight className="size-3 rtl:rotate-180" />
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t("dashboard.customerWorkspace.overview.noRecent")}
            </p>
          ) : (
            <div className="divide-y divide-border/50">
              {recent.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground">{fmtDate(item.timestamp, lang)}</p>
                  </div>
                  <WorkspaceStatusChip>
                    {item.id.startsWith("invoice-")
                      ? localizeInvoiceStatus(item.subtitle, (key) => t(key))
                      : localizeBookingStatus(item.subtitle, (key) => t(key))}
                  </WorkspaceStatusChip>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-3 py-3">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 text-primary" />
            <p className="text-sm text-muted-foreground">
              {t(
                aiInsights[0]?.messageKey ?? "dashboard.customerWorkspace.aiInsights.healthy",
                aiInsights[0]?.params,
              )}
            </p>
          </div>
          <Button size="sm" className="h-8 rounded-lg text-xs" onClick={() => onQuickAction("new-booking")}>
            {t("dashboard.customerWorkspace.overview.takeAction")}
          </Button>
        </section>
      </div>
    </WorkspaceTabFrame>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  warn,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${warn ? "text-warning" : ""}`}>{value}</p>
    </div>
  );
}
