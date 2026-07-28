import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { CustomerModal } from "@/components/dashboard/customer-modal";
import { DeleteDialog } from "@/components/dashboard/delete-dialog";
import { BookingModal } from "@/components/dashboard/booking-modal";
import { InvoiceModal } from "@/components/dashboard/invoice-modal";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { Can } from "@/components/rbac/permission-guard";
import { useHasPermission } from "@/hooks/use-rbac";
import { useToast } from "@/hooks/use-toast";
import { useCustomers, useDeleteCustomer } from "@/hooks/use-customers";
import { useBookings } from "@/hooks/use-bookings";
import { useInvoices } from "@/hooks/use-invoices";
import { useUser } from "@/context/auth-context";
import {
  BookingProfileService,
  CallService,
  ConversationService,
  InvoiceProfileService,
  type BookingModalPrefill,
  type InvoiceModalPrefill,
} from "@/lib/customer-profile/services";
import { customerWorkspaceHref } from "@/lib/customer-workspace/customer-workspace-utils";
import { saveCustomersListScroll, restoreCustomersListScroll } from "@/lib/customer-workspace/customers-list-scroll";
import {
  applyCustomerFilters,
  applySavedViewPreset,
  applyStatFilter,
  BUILT_IN_VIEWS,
  computeListStats,
  createDefaultFilters,
  enrichCustomers,
  exportCustomersCsv,
  sortCustomerRows,
  useCustomerListFilterState,
  useCustomersListPreferences,
  useDebouncedValue,
  type EnrichedCustomerRow,
  type StatFilterKey,
} from "@/lib/customers-list";
import { queryShellStateFromQuery } from "@/lib/react-query/query-shell-state";
import { QueryRefreshIndicator } from "@/components/ui/query-refresh-indicator";
import type { Customer } from "@/lib/types";
import { CustomersBulkActionsBar } from "./customers-bulk-actions-bar";
import { CustomersEmptyState } from "./customers-empty-state";
import { CustomersFilterPanel } from "./customers-filter-panel";
import { CustomersListGrid } from "./customers-list-grid";
import { CustomersListSkeleton } from "./customers-list-skeleton";
import { CustomersListStats } from "./customers-list-stats";
import { useRegisterFloatingAiContext } from "@/context/floating-ai-context";
import { CustomersListToolbar } from "./customers-list-toolbar";

function countActiveFilters(filters: ReturnType<typeof createDefaultFilters>): number {
  let count = 0;
  if (filters.status !== "all") count += 1;
  if (filters.vip !== null) count += 1;
  if (filters.gender !== "all") count += 1;
  if (filters.source !== "all") count += 1;
  if (filters.ageMin != null || filters.ageMax != null) count += 1;
  if (filters.tags.length > 0) count += 1;
  if (filters.outstandingMin != null || filters.outstandingMax != null) count += 1;
  if (filters.registeredFrom || filters.registeredTo) count += 1;
  if (filters.lastVisitFrom || filters.lastVisitTo) count += 1;
  if (filters.appointmentFrom || filters.appointmentTo) count += 1;
  return count;
}

export function CustomersListWorkspace() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { profile } = useUser();

  const { data: customers = [], error, isPending, isFetching } = useCustomers();
  const customersShell = queryShellStateFromQuery({ isPending, isFetching });
  const { data: bookings = [] } = useBookings();
  const { data: invoices = [] } = useInvoices();
  const deleteCustomer = useDeleteCustomer();

  const canEditCustomers = useHasPermission("customers.edit");
  const canDeleteCustomers = useHasPermission("customers.delete");
  const canCreateCustomers = useHasPermission("customers.create");

  const {
    prefs,
    setDensity,
    setSort,
    toggleColumn,
    reorderColumns,
    setColumnWidth,
    addCustomView,
  } = useCustomersListPreferences();

  const { filters, setFilters, patchFilters, resetFilters } = useCustomerListFilterState();
  const [draftFilters, setDraftFilters] = useState(filters);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [activeViewId, setActiveViewId] = useState("all");
  const [activeStat, setActiveStat] = useState<StatFilterKey | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [modal, setModal] = useState<{ open: boolean; customer?: Customer | null }>({ open: false });
  const [del, setDel] = useState<Customer | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bookingPrefill, setBookingPrefill] = useState<BookingModalPrefill | null>(null);
  const [invoicePrefill, setInvoicePrefill] = useState<InvoiceModalPrefill | null>(null);

  const companyId = profile?.company_id ?? null;

  const enriched = useMemo(
    () => enrichCustomers(customers, bookings, invoices),
    [customers, bookings, invoices],
  );

  const stats = useMemo(() => computeListStats(enriched), [enriched]);

  const displayedRows = useMemo(() => {
    let rows = enriched;
    const view = BUILT_IN_VIEWS.find((v) => v.id === activeViewId)
      ?? prefs.customViews.find((v) => v.id === activeViewId);

    if (view && view.id !== "all") {
      rows = applySavedViewPreset(rows, view);
    }

    rows = applyCustomerFilters(rows, filters, debouncedSearch);
    rows = applyStatFilter(rows, activeStat);
    rows = sortCustomerRows(rows, prefs.sortField, prefs.sortDirection);
    return rows;
  }, [
    enriched,
    activeViewId,
    prefs.customViews,
    prefs.sortField,
    prefs.sortDirection,
    filters,
    debouncedSearch,
    activeStat,
  ]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    enriched.forEach((row) => row.tags.forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort();
  }, [enriched]);

  const selectedRows = useMemo(
    () => displayedRows.filter((row) => selectedIds.has(row.customer.id)),
    [displayedRows, selectedIds],
  );

  const floatingAiContext = useMemo(
    () => ({
      page: "customers" as const,
      moduleLabel: t("navigation.customers"),
      pageTitle: t("navigation.customers"),
      selectedRows: selectedRows.map((row) => ({
        id: row.customer.id,
        label: row.customer.name ?? row.customer.id,
      })),
      selectedCount: selectedIds.size,
      filters: {
        ...filters,
        search: debouncedSearch,
        activeViewId,
        activeStat,
      },
      selectedCustomer:
        selectedRows.length === 1
          ? {
              id: selectedRows[0].customer.id,
              name: selectedRows[0].customer.name ?? "",
            }
          : null,
      currentEntity:
        selectedRows.length === 1
          ? {
              type: "customer" as const,
              id: selectedRows[0].customer.id,
              label: selectedRows[0].customer.name ?? "",
            }
          : null,
    }),
    [t, selectedRows, selectedIds.size, filters, debouncedSearch, activeViewId, activeStat],
  );

  useRegisterFloatingAiContext(floatingAiContext);

  const openWorkspace = useCallback(
    (id: string) => {
      saveCustomersListScroll();
      setLocation(customerWorkspaceHref(id));
    },
    [setLocation],
  );

  const handleQuickAction = useCallback(
    async (
      row: EnrichedCustomerRow,
      action: "call" | "whatsapp" | "email" | "booking" | "invoice" | "profile",
    ) => {
      const { customer } = row;

      if (action === "profile") {
        openWorkspace(customer.id);
        return;
      }

      if (action === "email") {
        if (customer.email) window.location.href = `mailto:${customer.email}`;
        return;
      }

      if (action === "call") {
        try {
          CallService.initiateCall(customer.phone);
        } catch {
          toast({
            variant: "destructive",
            title: t("dashboard.customerProfile.quickActions.errors.title"),
            description: t("dashboard.customerProfile.quickActions.errors.phoneMissing"),
          });
        }
        return;
      }

      if (action === "booking") {
        setBookingPrefill(BookingProfileService.buildModalPrefill(customer, companyId));
        return;
      }

      if (action === "invoice") {
        setInvoicePrefill(InvoiceProfileService.buildModalPrefill(customer, companyId));
        return;
      }

      try {
        await ConversationService.openWhatsappConversation({
          customerId: customer.id,
          companyId,
          navigate: setLocation,
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: t("dashboard.customerProfile.quickActions.errors.title"),
          description:
            error instanceof Error && error.message === "WHATSAPP_CONVERSATION_NOT_FOUND"
              ? t("dashboard.customerProfile.quickActions.errors.whatsappNotFound")
              : t("dashboard.customerProfile.quickActions.errors.generic"),
        });
      }
    },
    [companyId, openWorkspace, setLocation, t, toast],
  );

  const handleExport = useCallback(
    (rows: EnrichedCustomerRow[]) => {
      exportCustomersCsv(rows);
      toast({ title: t("dashboard.customers.list.exportSuccess") });
    },
    [t, toast],
  );

  const handleBulkDelete = useCallback(async () => {
    if (!canDeleteCustomers) return;
    for (const row of selectedRows) {
      await deleteCustomer.mutateAsync(row.customer.id);
    }
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    toast({ title: t("dashboard.customers.list.bulk.deleteSuccess") });
  }, [canDeleteCustomers, deleteCustomer, selectedRows, t, toast]);

  const handleStatClick = useCallback((key: StatFilterKey) => {
    setActiveStat((prev) => (prev === key ? null : key));
  }, []);

  const handleMoveColumn = useCallback(
    (columnId: typeof prefs.columnOrder[number], direction: "up" | "down") => {
      const order = [...prefs.columnOrder];
      const index = order.indexOf(columnId);
      if (index < 0) return;
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= order.length) return;
      [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
      reorderColumns(order);
    },
    [prefs.columnOrder, reorderColumns],
  );

  useEffect(() => {
    restoreCustomersListScroll();
  }, []);

  useEffect(() => {
    if (filterOpen) setDraftFilters(filters);
  }, [filterOpen, filters]);

  const emptyVariant = customers.length === 0 ? "all" : "filtered";

  return (
    <div className="space-y-4 pb-20">
      <CustomersListToolbar
        search={search}
        onSearchChange={setSearch}
        activeViewId={activeViewId}
        onViewChange={(viewId) => {
          setActiveViewId(viewId);
          const custom = prefs.customViews.find((view) => view.id === viewId);
          if (custom?.filters) {
            setFilters({ ...createDefaultFilters(), ...custom.filters });
          } else if (viewId === "all") {
            resetFilters();
          }
        }}
        customViews={prefs.customViews}
        onOpenFilters={() => setFilterOpen(true)}
        filterCount={countActiveFilters(filters)}
        sortField={prefs.sortField}
        sortDirection={prefs.sortDirection}
        onSortChange={setSort}
        density={prefs.density}
        onDensityChange={setDensity}
        columnOrder={prefs.columnOrder}
        columnVisibility={prefs.columnVisibility}
        onToggleColumn={toggleColumn}
        onMoveColumn={handleMoveColumn}
        onExport={() => handleExport(displayedRows)}
        onImport={() =>
          toast({
            title: t("dashboard.customers.list.importSoon"),
            description: t("dashboard.customers.list.importSoonDetail"),
          })
        }
        onCreate={() => setModal({ open: true, customer: null })}
        canCreate={canCreateCustomers}
      />

      <CustomersListStats
        stats={stats}
        activeStat={activeStat}
        onStatClick={handleStatClick}
        loading={customersShell.isInitialLoad}
      />

      {error && <DashboardErrorBanner message={error.message} />}

      <div className="flex justify-end">
        <QueryRefreshIndicator active={customersShell.isBackgroundRefresh} />
      </div>

      {customersShell.isInitialLoad ? (
        <CustomersListSkeleton density={prefs.density} />
      ) : displayedRows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <CustomersEmptyState
            variant={emptyVariant}
            canCreate={canCreateCustomers}
            onCreate={() => setModal({ open: true, customer: null })}
          />
        </div>
      ) : (
        <CustomersListGrid
          rows={displayedRows}
          density={prefs.density}
          columnOrder={prefs.columnOrder}
          columnVisibility={prefs.columnVisibility}
          columnWidths={prefs.columnWidths}
          onColumnResize={setColumnWidth}
          selectedIds={selectedIds}
          onToggleSelect={(id, checked) => {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              if (checked) next.add(id);
              else next.delete(id);
              return next;
            });
          }}
          onToggleSelectAll={(checked) => {
            if (checked) {
              setSelectedIds(new Set(displayedRows.map((row) => row.customer.id)));
            } else {
              setSelectedIds(new Set());
            }
          }}
          onOpenCustomer={openWorkspace}
          onEditCustomer={
            canEditCustomers
              ? (row) => setModal({ open: true, customer: row.customer })
              : undefined
          }
          onDeleteCustomer={
            canDeleteCustomers ? (row) => setDel(row.customer) : undefined
          }
          onQuickAction={handleQuickAction}
        />
      )}

      <CustomersFilterPanel
        open={filterOpen}
        onOpenChange={setFilterOpen}
        filters={draftFilters}
        onChange={(patch) => setDraftFilters((prev) => ({ ...prev, ...patch }))}
        onApply={() => setFilters(draftFilters)}
        onReset={() => {
          resetFilters();
          setDraftFilters(createDefaultFilters());
        }}
        onSaveView={(name) => {
          addCustomView({
            id: `custom-${Date.now()}`,
            label: name,
            filters: draftFilters,
            sortField: prefs.sortField,
            sortDirection: prefs.sortDirection,
          });
          toast({ title: t("dashboard.customers.list.views.saved") });
        }}
        availableTags={availableTags}
      />

      <CustomersBulkActionsBar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        canDelete={canDeleteCustomers}
        onDelete={() => setBulkDeleteOpen(true)}
        onExport={() => handleExport(selectedRows)}
        onPlaceholder={(action) =>
          toast({
            title: t("dashboard.customers.list.bulk.comingSoon"),
            description: t(`dashboard.customers.list.bulk.actions.${action}`),
          })
        }
      />

      <Can permission="customers.create">
        <CustomerModal open={modal.open} onClose={() => setModal({ open: false })} customer={modal.customer} />
      </Can>

      <DeleteDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => {
          if (!del || !canDeleteCustomers) return;
          deleteCustomer.mutate(del.id, { onSuccess: () => setDel(null) });
        }}
        isPending={deleteCustomer.isPending}
        itemName={del?.name}
      />

      <DeleteDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={() => void handleBulkDelete()}
        isPending={deleteCustomer.isPending}
        itemName={t("dashboard.customers.list.bulk.selected", { count: selectedIds.size })}
      />

      <BookingModal
        open={Boolean(bookingPrefill)}
        onClose={() => setBookingPrefill(null)}
        customers={customers}
        companyId={bookingPrefill?.companyId ?? companyId}
        defaultCustomerId={bookingPrefill?.customerId}
        lockCustomer={Boolean(bookingPrefill)}
        onCreated={() => {
          setBookingPrefill(null);
          toast({ title: t("dashboard.customerProfile.quickActions.success.bookingCreated") });
        }}
      />
      <InvoiceModal
        open={Boolean(invoicePrefill)}
        onClose={() => setInvoicePrefill(null)}
        customers={customers}
        defaultCustomerId={invoicePrefill?.customerId}
        lockCustomer={Boolean(invoicePrefill)}
        onCreated={() => {
          setInvoicePrefill(null);
          toast({ title: t("dashboard.customerProfile.quickActions.success.invoiceCreated") });
        }}
      />
    </div>
  );
}
