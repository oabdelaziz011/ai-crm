import { format } from "date-fns";
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  DollarSign,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { CustomerProfileQuickAction, CustomerProfileTab } from "@/components/customer-profile/types";
import { WorkspaceAiInsights } from "@/components/customer-workspace/workspace-ai-insights";
import {
  WorkspaceHealthCard,
  WorkspaceMetric,
  WorkspacePanel,
  WorkspaceListRow,
  WorkspaceGuidedEmpty,
} from "@/components/customer-workspace/workspace-ui";
import {
  buildCustomerActivityTimeline,
  computeCustomerHealth,
  deriveWorkspaceAiInsights,
  filterBookingsForCustomer,
  filterInvoicesForCustomer,
  fmtCurrency,
  fmtDate,
  lastPaidInvoice,
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
  const { t } = useTranslation("common");
  const customerBookings = filterBookingsForCustomer(allBookings, customer.id);
  const customerInvoices = filterInvoicesForCustomer(allInvoices, customer.id);
  const upcoming = nextUpcomingBooking(customerBookings);
  const lastPayment = lastPaidInvoice(customerInvoices);
  const latestInvoice = recentInvoice(customerInvoices);
  const recent = buildCustomerActivityTimeline(customer, customerBookings, customerInvoices, 5);
  const loading = bookingsLoading || invoicesLoading;
  const cancelled = customerBookings.filter((b) => b.status === "Cancelled").length;
  const overdue = customerInvoices.filter((inv) => inv.status === "Overdue").length;
  const health = computeCustomerHealth(ltv, outstanding, cancelled, overdue);

  const handleInsight = (insight: WorkspaceAiInsight) => {
    if (insight.actionTab) onNavigateTab(insight.actionTab);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Who · Value · Next action */}
      <div className="grid gap-4 lg:grid-cols-12">
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

        <WorkspaceAiInsights
          className="lg:col-span-8"
          insights={aiInsights.length ? aiInsights : deriveWorkspaceAiInsights(customer, allBookings, allInvoices)}
          onInsightAction={handleInsight}
        />
      </div>

      {/* Value metrics — compact strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <WorkspaceMetric label={t("dashboard.customerWorkspace.ltv")} value={loading ? "—" : fmtCurrency(ltv)} icon={TrendingUp} compact />
        <WorkspaceMetric label={t("dashboard.customerWorkspace.outstanding")} value={loading ? "—" : fmtCurrency(outstanding)} icon={DollarSign} accent={outstanding > 0 ? "warning" : undefined} compact />
        <WorkspaceMetric label={t("dashboard.customerProfile.metrics.bookings")} value={loading ? "—" : customerBookings.length} icon={CalendarDays} compact />
        <WorkspaceMetric label={t("dashboard.customerProfile.metrics.invoices")} value={loading ? "—" : customerInvoices.length} icon={CreditCard} compact />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Upcoming */}
        <WorkspacePanel title={t("dashboard.customerWorkspace.overview.upcomingTitle")} dense>
          {bookingsLoading ? (
            <div className="h-16 animate-pulse rounded-lg bg-muted/40" />
          ) : upcoming ? (
            <button type="button" onClick={() => onNavigateTab("bookings")} className="flex w-full items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-start hover:bg-primary/10">
              <CalendarDays className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm">{upcoming.service}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(upcoming.booking_date)} · {upcoming.status}</p>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
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
        </WorkspacePanel>

        {/* Outstanding */}
        <WorkspacePanel title={t("dashboard.customerWorkspace.overview.balanceTitle")} dense>
          <p className="font-mono text-3xl font-bold tabular-nums">{invoicesLoading ? "—" : fmtCurrency(outstanding)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("dashboard.customerWorkspace.overview.balanceHint")}</p>
          {outstanding > 0 && (
            <Button variant="link" size="sm" className="mt-2 h-auto p-0 text-xs" onClick={() => onNavigateTab("invoices")}>
              {t("dashboard.customerWorkspace.overview.viewInvoices")}
            </Button>
          )}
        </WorkspacePanel>

        {/* Last payment */}
        <WorkspacePanel title={t("dashboard.customerWorkspace.overview.lastPaymentTitle")} dense>
          {invoicesLoading ? (
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
          ) : lastPayment ? (
            <div className="flex items-center gap-3">
              <CreditCard className="size-5 text-success" />
              <div>
                <p className="font-mono text-lg font-bold">{fmtCurrency(Number(lastPayment.amount))}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(lastPayment.invoice_date)}</p>
              </div>
            </div>
          ) : (
            <WorkspaceGuidedEmpty
              icon={CreditCard}
              title={t("dashboard.customerWorkspace.overview.noLastPayment")}
              description={t("dashboard.customerWorkspace.payments.emptyDescription")}
              actionLabel={t("dashboard.customerWorkspace.header.newInvoice")}
              onAction={() => onQuickAction("new-invoice")}
            />
          )}
        </WorkspacePanel>

        {/* Recent invoice */}
        <WorkspacePanel title={t("dashboard.customerWorkspace.overview.recentInvoiceTitle")} dense>
          {invoicesLoading ? (
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
          ) : latestInvoice ? (
            <WorkspaceListRow
              title={fmtCurrency(Number(latestInvoice.amount))}
              subtitle={fmtDate(latestInvoice.invoice_date)}
              badge={latestInvoice.status}
              onClick={() => onNavigateTab("invoices")}
            />
          ) : (
            <WorkspaceGuidedEmpty
              icon={DollarSign}
              title={t("dashboard.customerWorkspace.invoices.emptyTitle")}
              description={t("dashboard.customerWorkspace.invoices.emptyDescription")}
              actionLabel={t("buttons.newInvoice")}
              onAction={() => onQuickAction("new-invoice")}
            />
          )}
        </WorkspacePanel>

        {/* Recent activity */}
        <WorkspacePanel
          className="lg:col-span-2"
          title={t("dashboard.customerWorkspace.overview.recentTitle")}
          dense
          action={
            <button type="button" onClick={() => onNavigateTab("timeline")} className="text-[11px] font-semibold text-primary hover:underline">
              {t("dashboard.customerWorkspace.overview.viewTimeline")}
            </button>
          }
        >
          {recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("dashboard.customerWorkspace.overview.noRecent")}</p>
          ) : (
            <div className="space-y-1.5">
              {recent.map((item) => (
                <WorkspaceListRow
                  key={item.id}
                  title={item.title}
                  subtitle={format(new Date(item.timestamp), "MMM d · h:mm a")}
                  badge={item.subtitle}
                  compact
                />
              ))}
            </div>
          )}
        </WorkspacePanel>

        {/* AI Recommendation CTA */}
        <WorkspacePanel
          className="lg:col-span-2"
          title={t("dashboard.customerWorkspace.overview.aiRecommendation")}
          dense
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(aiInsights[0]?.messageKey ?? "dashboard.customerWorkspace.aiInsights.healthy", aiInsights[0]?.params)}
              </p>
            </div>
            <Button size="sm" className="shrink-0" onClick={() => onQuickAction("new-booking")}>
              {t("dashboard.customerWorkspace.overview.takeAction")}
            </Button>
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
