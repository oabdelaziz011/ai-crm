import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { useLocation } from "wouter";

import { Loader2, ArrowLeft } from "lucide-react";

import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import { DashboardErrorBanner } from "@/components/dashboard/ui";

import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";

import { CustomerWorkspaceShell } from "@/components/customer-workspace/customer-workspace-shell";

import { WorkspaceTabAccessDenied } from "@/components/customer-workspace/workspace-tab-access-denied";

import { Ticket360Workspace } from "@/components/tickets/ticket360-workspace";

import { CreateCustomerTicketDialog } from "@/components/tickets/create-customer-ticket-dialog";

import { useAuth } from "@/context/auth-context";

import { useCustomer, useCustomerRealtime } from "@/hooks/use-customer";

import { useCustomers } from "@/hooks/use-customers";

import { useBookings } from "@/hooks/use-bookings";

import { useInvoices } from "@/hooks/use-invoices";

import { useCustomerProfileQuickActions } from "@/hooks/use-customer-profile-quick-actions";

import { useHasPermission } from "@/hooks/use-rbac";

import { useCustomerWorkspaceAccess } from "@/hooks/customer-workspace/use-customer-workspace-access";

import {

  resolveCustomerWorkspaceCompanyId,

  resolveCustomerWorkspaceCompanyIdHint,

} from "@/lib/customer-workspace/resolve-customer-workspace-company-id";

import { profileTabToWorkspaceTopTab } from "@/lib/customer-workspace/workspace-navigation";

import { CRM_LIST_MAX_ROWS } from "@/lib/crm/crm-list-config";

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

import { NEST_INDEX } from "@/lib/routing";

import { queryShellStateFromQuery } from "@/lib/react-query/query-shell-state";



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

const TicketsTab = lazy(() =>

  import("@/components/customer-workspace/tabs/workspace-tickets-tab").then((m) => ({

    default: m.WorkspaceTicketsTab,

  })),

);

const CampaignsTab = lazy(() =>

  import("@/components/customer-workspace/tabs/workspace-campaigns-tab").then((m) => ({

    default: m.WorkspaceCampaignsTab,

  })),

);



type CustomerWorkspacePageProps = {

  customerId: string;

  tab?: string;

  context?: CustomerProfileContext;

};



function tabDeniedLabelKey(tab: CustomerProfileTab): string {

  const top = profileTabToWorkspaceTopTab(tab);

  return `dashboard.customerWorkspace.tabs.${top}`;

}



export function CustomerWorkspacePage({

  customerId,

  tab: tabParam,

  context,

}: CustomerWorkspacePageProps) {

  const { t } = useTranslation("common");

  const [, setLocation] = useLocation();

  const { profile, isSuperAdmin } = useAuth();

  const activeTab = normalizeCustomerProfileTab(tabParam);

  const canEdit = useHasPermission("customers.edit");

  const workspaceAccess = useCustomerWorkspaceAccess(activeTab);



  const customerQuery = useCustomer(customerId);

  const customer = customerQuery.data;

  const companyResolution = customer

    ? resolveCustomerWorkspaceCompanyId({

        customerCompanyId: customer.company_id,

        profileCompanyId: profile?.company_id,

        contextCompanyId: context?.companyId,

        isSuperAdmin,

      })

    : null;

  const companyId = companyResolution?.ok

    ? companyResolution.companyId

    : resolveCustomerWorkspaceCompanyIdHint({

        profileCompanyId: profile?.company_id,

        contextCompanyId: context?.companyId,

      });

  const error = customerQuery.error;

  const customerShell = queryShellStateFromQuery(customerQuery);



  const needsBookingData = workspaceAccess.canAccessBookings;
  const needsFinanceData = workspaceAccess.canAccessFinance;



  const { data: customers = [] } = useCustomers();

  const bookingsQuery = useBookings({

    enabled: needsBookingData && !workspaceAccess.isLoading,

  });

  const invoicesQuery = useInvoices(CRM_LIST_MAX_ROWS, {

    enabled: needsFinanceData && !workspaceAccess.isLoading,

  });

  const allBookings = workspaceAccess.canAccessBookings ? (bookingsQuery.data ?? []) : [];

  const allInvoices = workspaceAccess.canAccessFinance ? (invoicesQuery.data ?? []) : [];

  const bookingsLoading = workspaceAccess.canAccessBookings

    ? queryShellStateFromQuery(bookingsQuery).isInitialLoad

    : false;

  const invoicesLoading = workspaceAccess.canAccessFinance

    ? queryShellStateFromQuery(invoicesQuery).isInitialLoad

    : false;



  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const [createTicketOpen, setCreateTicketOpen] = useState(false);



  useCustomerRealtime(customerId);



  useEffect(() => {

    if (workspaceAccess.redirectTab && workspaceAccess.redirectTab !== activeTab) {

      setLocation(customerWorkspaceHref(customerId, workspaceAccess.redirectTab));

    }

  }, [activeTab, customerId, setLocation, workspaceAccess.redirectTab]);



  const customerInvoices = useMemo(

    () =>

      workspaceAccess.canAccessFinance && customer

        ? filterInvoicesForCustomer(allInvoices, customer.id)

        : [],

    [allInvoices, customer, workspaceAccess.canAccessFinance],

  );



  const customerBookings = useMemo(

    () =>

      workspaceAccess.canAccessBookings && customer

        ? filterBookingsForCustomer(allBookings, customer.id)

        : [],

    [allBookings, customer, workspaceAccess.canAccessBookings],

  );



  const nextBooking = useMemo(

    () => (workspaceAccess.canAccessBookings ? nextUpcomingBooking(customerBookings) : null),

    [customerBookings, workspaceAccess.canAccessBookings],

  );

  const lastVisit = useMemo(

    () => (workspaceAccess.canAccessBookings ? lastVisitBooking(customerBookings) : null),

    [customerBookings, workspaceAccess.canAccessBookings],

  );



  const ltv = useMemo(

    () => (workspaceAccess.canAccessFinance ? computeCustomerLtv(customerInvoices) : 0),

    [customerInvoices, workspaceAccess.canAccessFinance],

  );

  const outstanding = useMemo(

    () =>

      workspaceAccess.canAccessFinance ? computeOutstandingBalance(customerInvoices) : 0,

    [customerInvoices, workspaceAccess.canAccessFinance],

  );



  const aiInsights = useMemo(() => {

    if (!customer || !workspaceAccess.canAccessAi) return [];

    return deriveWorkspaceAiInsights(

      customer,

      workspaceAccess.canAccessBookings ? allBookings : [],

      workspaceAccess.canAccessFinance ? allInvoices : [],

    );

  }, [

    allBookings,

    allInvoices,

    customer,

    workspaceAccess.canAccessAi,

    workspaceAccess.canAccessBookings,

    workspaceAccess.canAccessFinance,

  ]);



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

    canExecuteAction: workspaceAccess.isQuickActionAllowed,

  });



  const navigateTab = (tab: CustomerProfileTab) => {

    if (!workspaceAccess.isProfileTabAccessible(tab)) return;

    setLocation(customerWorkspaceHref(customerId, tab));

  };



  const onQuickAction = (action: CustomerProfileQuickAction) => {

    if (!workspaceAccess.isQuickActionAllowed(action)) return;

    void executeQuickAction(action);

  };



  if (customerShell.isInitialLoad && !customer) {

    return (

      <div className="flex h-full min-h-0 items-center justify-center bg-muted/40">

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

      <div className="flex h-full min-h-0 items-center justify-center bg-muted/40">

        <Loader2 className="size-8 animate-spin text-primary" />

      </div>

    );

  }



  if (workspaceAccess.isLoading) {

    return (

      <div className="flex h-full min-h-0 items-center justify-center bg-muted/40">

        <Loader2 className="size-8 animate-spin text-primary" />

      </div>

    );

  }



  const tags = deriveCustomerTags(

    customer,

    ltv,

    workspaceAccess.canAccessBookings ? customerBookings.length : 0,

  );



  const renderTabContent = () => {

    if (!workspaceAccess.isProfileTabAccessible(activeTab)) {

      return <WorkspaceTabAccessDenied tabLabelKey={tabDeniedLabelKey(activeTab)} />;

    }



    switch (activeTab) {

      case "overview":

        return (

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

            showBookings={workspaceAccess.canAccessBookings}

            showFinance={workspaceAccess.canAccessFinance}

            showAi={workspaceAccess.canAccessAi}

            canNewBooking={workspaceAccess.isQuickActionAllowed("new-booking")}

            canNewInvoice={workspaceAccess.isQuickActionAllowed("new-invoice")}

          />

        );

      case "timeline":

        return (

          <TimelineTab

            customerId={customer.id}

            companyId={companyResolution?.ok ? companyResolution.companyId : null}

            tenantError={

              companyResolution && !companyResolution.ok ? companyResolution.reason : null

            }

          />

        );

      case "tickets":

        return (

          <TicketsTab

            customerId={customer.id}

            onOpenTicket={(ticketId) => setSelectedTicketId(ticketId)}

            onCreateTicket={() => setCreateTicketOpen(true)}

          />

        );

      case "bookings":

        return (

          <BookingsTab

            customer={customer}

            bookings={allBookings}

            loading={bookingsLoading}

            onNewBooking={() => onQuickAction("new-booking")}

            canNewBooking={workspaceAccess.isQuickActionAllowed("new-booking")}

          />

        );

      case "invoices":

        return (

          <InvoicesTab

            customer={customer}

            invoices={allInvoices}

            loading={invoicesLoading}

            onNewInvoice={() => onQuickAction("new-invoice")}

            canNewInvoice={workspaceAccess.isQuickActionAllowed("new-invoice")}

          />

        );

      case "payments":

        return (

          <PaymentsTab invoices={allInvoices} customerId={customer.id} loading={invoicesLoading} />

        );

      case "communication":

        return (

          <CommunicationTab

            customer={customer}

            companyId={companyId}

            canEdit={canEdit}

            onQuickAction={onQuickAction}

            isActionPending={isActionPending}

            canWhatsapp={workspaceAccess.canAccessWhatsapp}

          />

        );

      case "files":

        return <FilesTab customerId={customer.id} />;

      case "ai-summary":

        return (

          <AiSummaryTab

            customer={customer}

            bookings={workspaceAccess.canAccessBookings ? allBookings : []}

            invoices={workspaceAccess.canAccessFinance ? allInvoices : []}

          />

        );

      case "history":

        return (

          <HistoryTab

            customer={customer}

            companyId={companyId}

            moduleAccess={workspaceAccess.auditModuleAccess}

          />

        );

      case "campaigns":

        return <CampaignsTab customerId={customer.id} companyId={companyId} />;

      default:

        return null;

    }

  };



  return (

    <>

      <div className="flex h-full min-h-0 flex-col">

        <CustomerWorkspaceShell

          customer={customer}

          activeTab={activeTab}

          accessibleTabs={workspaceAccess.accessibleTabs}

          onTabChange={navigateTab}

          onBack={() => setLocation(NEST_INDEX)}

          onQuickAction={onQuickAction}

          isQuickActionPending={isActionPending}

          canNewBooking={workspaceAccess.isQuickActionAllowed("new-booking")}

          canWhatsapp={workspaceAccess.canAccessWhatsapp}

          canCall={workspaceAccess.isQuickActionAllowed("call")}

          ltv={ltv}

          outstanding={outstanding}

          tags={tags}

          nextBooking={nextBooking}

          lastVisit={lastVisit}

          aiInsights={aiInsights}

          showFinanceKpis={workspaceAccess.canAccessFinance}

          showBookingKpis={workspaceAccess.canAccessBookings}

          showAiInsights={workspaceAccess.canAccessAi}

        >

          <Suspense fallback={<DashboardPageFallback />}>{renderTabContent()}</Suspense>

        </CustomerWorkspaceShell>

      </div>



      <Ticket360Workspace

        ticketId={selectedTicketId}

        open={Boolean(selectedTicketId)}

        onOpenChange={(open) => {

          if (!open) setSelectedTicketId(null);

        }}

        onOpenTicket={(ticketId) => setSelectedTicketId(ticketId)}

      />



      <CreateCustomerTicketDialog

        open={createTicketOpen}

        onOpenChange={setCreateTicketOpen}

        customerId={customer.id}

        customerName={customer.name}

        onCreated={(ticketId) => setSelectedTicketId(ticketId)}

      />



      {workspaceAccess.isQuickActionAllowed("new-booking") && (

        <BookingModal

          open={!!bookingPrefill}

          onClose={closeBookingModal}

          customers={customers}

          companyId={bookingPrefill?.companyId ?? companyId}

          defaultCustomerId={bookingPrefill?.customerId ?? customer.id}

          lockCustomer={!!bookingPrefill}

          onCreated={handleBookingCreated}

        />

      )}



      {workspaceAccess.isQuickActionAllowed("new-invoice") && (

        <InvoiceModal

          open={!!invoicePrefill}

          onClose={closeInvoiceModal}

          customers={customers}

          defaultCustomerId={invoicePrefill?.customerId ?? customer.id}

          lockCustomer={!!invoicePrefill}

          onCreated={handleInvoiceCreated}

        />

      )}

    </>

  );

}


