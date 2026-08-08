import { lazy, Suspense, useMemo } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { CustomerWorkspaceShell } from "@/components/customer-workspace/customer-workspace-shell";
import { WorkspaceCommerceTab } from "@/components/customer-workspace/tabs/workspace-commerce-tab";
import { useAuth } from "@/context/auth-context";
import { useCustomer, useCustomerRealtime } from "@/hooks/use-customer";
import { useCustomers } from "@/hooks/use-customers";
import { useBookings } from "@/hooks/use-bookings";
import { useInvoices } from "@/hooks/use-invoices";
import { useCustomerProfileQuickActions } from "@/hooks/use-customer-profile-quick-actions";
import { useHasPermission } from "@/hooks/use-rbac";
import { BookingModal } from "@/components/dashboard/booking-modal";
import { InvoiceModal } from "@/components/dashboard/invoice-modal";
import {
  normalizeCustomerProfileTab,
  type CustomerProfileContext,
  type CustomerProfileQuickAction,
  type CustomerProfileTab,
} from "@/components/customer-profile/types";
import {
  computeCustomerLtv,
  computeOutstandingBalance,
  customerWorkspaceHref,
  deriveCustomerTags,
  deriveWorkspaceAiInsights,
  filterBookingsForCustomer,
  filterInvoicesForCustomer,
  lastVisitBooking,
  nextUpcomingBooking,
} from "@/lib/customer-workspace/customer-workspace-utils";
import { isCommerceTab } from "@/lib/customer-workspace/workspace-navigation";
import { NEST_INDEX } from "@/lib/routing";
import { queryShellStateFromQuery } from "@/lib/react-query/query-shell-state";
import { QueryRefreshIndicator } from "@/components/ui/query-refresh-indicator";

const OverviewTab = lazy(() =>
  import("@/components/customer-workspace/tabs/workspace-overview-tab").then((m) => ({
    default: m.WorkspaceOverviewTab,
  })),
);
const TimelineTab = lazy(() =>
  import("@/components/customer-workspace/tabs/workspace-timeline-tab").then((m) => ({
    default: m.WorkspaceTimelineTab,
  })),
);
const BookingsTab = lazy(() =>
  import("@/components/customer-workspace/tabs/workspace-bookings-tab").then((m) => ({
    default: m.WorkspaceBookingsTab,
  })),
);
const InvoicesTab = lazy(() =>
  import("@/components/customer-workspace/tabs/workspace-invoices-tab").then((m) => ({
    default: m.WorkspaceInvoicesTab,
  })),
);
const PaymentsTab = lazy(() =>
  import("@/components/customer-workspace/tabs/workspace-payments-tab").then((m) => ({
    default: m.WorkspacePaymentsTab,
  })),
);
const CommunicationTab = lazy(() =>
  import("@/components/customer-workspace/tabs/workspace-communication-tab").then((m) => ({
    default: m.WorkspaceCommunicationTab,
  })),
);
const FilesTab = lazy(() =>
  import("@/components/customer-workspace/tabs/workspace-files-tab").then((m) => ({
    default: m.WorkspaceFilesTab,
  })),
);
const AiSummaryTab = lazy(() =>
  import("@/components/customer-workspace/tabs/workspace-ai-summary-tab").then((m) => ({
    default: m.WorkspaceAiSummaryTab,
  })),
);
const HistoryTab = lazy(() =>
  import("@/components/customer-workspace/tabs/workspace-history-tab").then((m) => ({
    default: m.WorkspaceHistoryTab,
  })),
);

type CustomerWorkspacePageProps = {
  customerId: string;
  tab?: string;
  context?: CustomerProfileContext;
};

export function CustomerWorkspacePage({
  customerId,
  tab: tabParam,
  context,
}: CustomerWorkspacePageProps) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { profile } = useAuth();
  const companyId = context?.companyId ?? profile?.company_id ?? null;
  const activeTab = normalizeCustomerProfileTab(tabParam);
  const canEdit = useHasPermission("customers.edit");

  const customerQuery = useCustomer(customerId);
  const customer = customerQuery.data;
  const error = customerQuery.error;
  const customerShell = queryShellStateFromQuery(customerQuery);
  const { data: customers = [] } = useCustomers();
  const bookingsQuery = useBookings();
  const invoicesQuery = useInvoices();
  const allBookings = bookingsQuery.data ?? [];
  const allInvoices = invoicesQuery.data ?? [];
  const bookingsLoading = queryShellStateFromQuery(bookingsQuery).isInitialLoad;
  const invoicesLoading = queryShellStateFromQuery(invoicesQuery).isInitialLoad;

  useCustomerRealtime(customerId);

  const customerInvoices = useMemo(
    () => (customer ? filterInvoicesForCustomer(allInvoices, customer.id) : []),
    [allInvoices, customer],
  );

  const customerBookings = useMemo(
    () => (customer ? filterBookingsForCustomer(allBookings, customer.id) : []),
    [allBookings, customer],
  );

  const nextBooking = useMemo(() => nextUpcomingBooking(customerBookings), [customerBookings]);
  const lastVisit = useMemo(() => lastVisitBooking(customerBookings), [customerBookings]);

  const ltv = useMemo(() => computeCustomerLtv(customerInvoices), [customerInvoices]);
  const outstanding = useMemo(() => computeOutstandingBalance(customerInvoices), [customerInvoices]);

  const aiInsights = useMemo(
    () => (customer ? deriveWorkspaceAiInsights(customer, allBookings, allInvoices) : []),
    [allBookings, allInvoices, customer],
  );

  const {
    executeQuickAction,
    isActionPending,
    bookingPrefill,
    closeBookingModal,
    invoicePrefill,
    closeInvoiceModal,
    handleBookingCreated,
    handleInvoiceCreated,
  } = useCustomerProfileQuickActions({
    customer,
    context: { ...context, companyId },
    onOpenNotesTab: () => setLocation(customerWorkspaceHref(customerId, "communication")),
  });

  const navigateTab = (tab: CustomerProfileTab) => {
    setLocation(customerWorkspaceHref(customerId, tab));
  };

  const onQuickAction = (action: CustomerProfileQuickAction) => {
    void executeQuickAction(action);
  };

  if (customerShell.isInitialLoad && !customer) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-[hsl(222_44%_7%)]">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if ((error || !customer) && !customerShell.isBackgroundRefresh) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => setLocation(NEST_INDEX)}>
          <ArrowLeft className="size-4" />
          {t("dashboard.customerWorkspace.backToList")}
        </Button>
        <DashboardErrorBanner message={error?.message ?? t("dashboard.customerDetails.loadError")} />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-[hsl(222_44%_7%)]">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const tags = deriveCustomerTags(customer, ltv, customerBookings.length);
  const commerceSub = isCommerceTab(activeTab) ? activeTab : "bookings";

  return (
    <>
      <CustomerWorkspaceShell
        customer={customer}
        activeTab={activeTab}
        onTabChange={navigateTab}
        onBack={() => setLocation(NEST_INDEX)}
        onQuickAction={onQuickAction}
        isQuickActionPending={isActionPending}
        ltv={ltv}
        outstanding={outstanding}
        tags={tags}
        nextBooking={nextBooking}
        lastVisit={lastVisit}
        aiInsights={aiInsights}
      >
        <Suspense fallback={<DashboardPageFallback />}>
          {activeTab === "overview" && (
            <OverviewTab
              customer={customer}
              onQuickAction={onQuickAction}
              outstanding={outstanding}
              ltv={ltv}
              bookingsLoading={bookingsLoading}
              invoicesLoading={invoicesLoading}
              allBookings={allBookings}
              allInvoices={allInvoices}
              onNavigateTab={navigateTab}
              aiInsights={aiInsights}
            />
          )}
          {(activeTab === "timeline") && (
            <TimelineTab customerId={customer.id} companyId={companyId} />
          )}
          {isCommerceTab(activeTab) && (
            <WorkspaceCommerceTab active={commerceSub} onChange={navigateTab}>
              {commerceSub === "bookings" && (
                <BookingsTab
                  customer={customer}
                  bookings={allBookings}
                  loading={bookingsLoading}
                  onNewBooking={() => onQuickAction("new-booking")}
                />
              )}
              {commerceSub === "invoices" && (
                <InvoicesTab
                  customer={customer}
                  invoices={allInvoices}
                  loading={invoicesLoading}
                  onNewInvoice={() => onQuickAction("new-invoice")}
                />
              )}
              {commerceSub === "payments" && (
                <PaymentsTab invoices={allInvoices} customerId={customer.id} loading={invoicesLoading} />
              )}
            </WorkspaceCommerceTab>
          )}
          {activeTab === "communication" && (
            <CommunicationTab
              customer={customer}
              companyId={companyId}
              canEdit={canEdit}
              onQuickAction={onQuickAction}
              isActionPending={isActionPending}
            />
          )}
          {activeTab === "files" && <FilesTab customerId={customer.id} />}
          {activeTab === "ai-summary" && (
            <AiSummaryTab customer={customer} bookings={allBookings} invoices={allInvoices} />
          )}
          {activeTab === "history" && (
            <HistoryTab customer={customer} context={{ ...context, companyId }} />
          )}
        </Suspense>
      </CustomerWorkspaceShell>

      <BookingModal
        open={!!bookingPrefill}
        onClose={closeBookingModal}
        customers={customers}
        companyId={bookingPrefill?.companyId ?? companyId}
        defaultCustomerId={bookingPrefill?.customerId ?? customer.id}
        lockCustomer={!!bookingPrefill}
        onCreated={handleBookingCreated}
      />
      <InvoiceModal
        open={!!invoicePrefill}
        onClose={closeInvoiceModal}
        customers={customers}
        defaultCustomerId={invoicePrefill?.customerId ?? customer.id}
        lockCustomer={!!invoicePrefill}
        onCreated={handleInvoiceCreated}
      />
    </>
  );
}
