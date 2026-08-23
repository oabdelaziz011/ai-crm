import { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  CLINIC_COLUMNS,
  type OperationsColumnDefinition,
  type OperationsRow,
} from "@workspace/universal-operations-engine";
import { OperationsDataGrid } from "@/components/universal-operations/queue/operations-data-grid";
import { OperationsWorkspacePanel } from "@/components/universal-operations/panel/operations-workspace-panel";
import { OperationsRowActionsMenu } from "@/components/universal-operations/action-registry/operations-row-actions-menu";
import { ActionConfirmationDialog } from "@/components/universal-operations/action-registry/action-confirmation-dialog";
import { CollectPaymentDialog } from "@/components/universal-operations/action-registry/collect-payment-dialog";
import { BookingModal } from "@/components/dashboard/booking-modal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useCompanyLocaleContext } from "@/context/company-locale-context";
import { useOperationsActionEngine, useUniversalOperationsQueue } from "@/hooks/universal-operations";
import { useCustomer360Role } from "@/hooks/universal-operations/use-customer360-workspace";
import { useWorkspacePlatformOptional } from "@/context/workspace-platform-context";
import { useCustomersEnrichment } from "@/hooks/use-customers";
import { translateOperationsQueueColumnHeader } from "@/lib/i18n/operations-queue-labels";
import { resolveQueueKpis, type ResolvedQueueKpi } from "@/lib/universal-operations/operations-queue-kpis";
import {
  resolveQueueDateRange,
  type QueueDatePreset,
} from "@/lib/universal-operations/operations-queue-date-range";
import { resolveQueueTimezone } from "@/lib/scheduling/operations/utilities/calendar-day-range";
import { cn } from "@/lib/utils";
import type { TFunction } from "i18next";

/** Operator-facing column order — Queue 2.1 / 2.2. */
const OPERATOR_COLUMN_ORDER = [
  "reference",
  "queue_number",
  "scheduled_at",
  "appointment_time",
  "customer",
  "visit_type",
  "service",
  "amount",
  "phone",
  "status",
  "payment_status",
  "waiting_minutes",
  "actions",
] as const;

const ACTIONS_COLUMN: OperationsColumnDefinition = {
  id: "col_actions",
  internalName: "actions",
  displayName: "Actions",
  icon: "MoreHorizontal",
  type: "text",
  visible: true,
  required: false,
  sortable: false,
  filterable: false,
  searchable: false,
  exportable: false,
  reportable: false,
  aiIndexed: false,
  width: 56,
  alignment: "center",
  defaultValue: null,
  validation: null,
  permissions: [],
  position: 999,
  pinned: "right",
};

function withOperatorColumns(
  columns: OperationsColumnDefinition[],
  t: TFunction,
  templateKey: string,
  hiddenColumnIds: string[],
): OperationsColumnDefinition[] {
  const byName = new Map<string, OperationsColumnDefinition>();
  for (const column of CLINIC_COLUMNS) byName.set(column.internalName, column);
  for (const column of columns) byName.set(column.internalName, column);
  if (!byName.has("actions")) {
    byName.set("actions", ACTIONS_COLUMN);
  }

  const hidden = new Set(hiddenColumnIds);
  const next: OperationsColumnDefinition[] = [];
  for (const internalName of OPERATOR_COLUMN_ORDER) {
    const column = byName.get(internalName);
    if (!column) continue;
    if (internalName !== "actions" && hidden.has(column.id)) continue;
    const displayName = translateOperationsQueueColumnHeader(
      t,
      internalName,
      templateKey,
      column.displayName,
    );
    if (internalName === "queue_number" || internalName === "customer") {
      next.push({ ...column, displayName, pinned: "left", visible: true });
      continue;
    }
    if (internalName === "actions") {
      next.push({ ...column, displayName, pinned: "right", visible: true });
      continue;
    }
    if (internalName === "scheduled_at") {
      next.push({
        ...column,
        displayName,
        visible: true,
        pinned: null,
        width: 128,
      });
      continue;
    }
    next.push({
      ...column,
      displayName,
      visible: true,
      pinned: null,
    });
  }
  return next;
}

function QueueKpiStrip({ kpis }: { kpis: ResolvedQueueKpi[] }) {
  return (
    <div className="grid shrink-0 grid-cols-3 overflow-hidden rounded-xl border border-border/60 bg-background sm:grid-cols-3 lg:grid-cols-9">
      {kpis.map((kpi, index) => (
        <div
          key={kpi.id}
          className={cn(
            "flex min-h-[72px] flex-col justify-center px-3.5 py-3",
            index > 0 && "border-s border-border/50",
          )}
        >
          <span className="truncate text-[11px] font-medium text-muted-foreground">
            {kpi.label}
          </span>
          <span
            className={cn(
              "mt-1 text-[22px] font-semibold tabular-nums tracking-[-0.03em] leading-tight",
              kpi.accent === "warning" && "text-warning",
              kpi.accent === "success" && "text-success",
              kpi.accent === "danger" && "text-destructive",
            )}
          >
            {kpi.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function OperationsQueuePage() {
  const { t } = useTranslation("common");
  const { profile } = useAuth();
  const platform = useWorkspacePlatformOptional();
  const [localTemplate] = useState("clinic");
  const templateKey = platform?.templateKey ?? localTemplate;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedRow, setSelectedRow] = useState<OperationsRow | null>(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const { data: customers = [] } = useCustomersEnrichment();
  const { currency: companyCurrency } = useCompanyLocaleContext();

  const {
    config,
    columns,
    page,
    loading,
    isFetching,
    query,
    setQuery,
    updateSearch,
    updateSort,
    loadMore,
    preferences,
    setPreferences,
    refetch,
  } = useUniversalOperationsQueue(templateKey);

  const { role: workspaceRole } = useCustomer360Role();

  const openAppointmentDrawer = useCallback((row: OperationsRow) => {
    setSelectedRow(row);
  }, []);

  const actionEngine = useOperationsActionEngine({
    config,
    workspaceRole,
    templateKey,
    onActionSuccess: (action, row) => {
      if (
        action.id === "appointments.cancel" ||
        action.id === "appointments.mark_no_show" ||
        action.id === "appointments.archive"
      ) {
        setSelectedRow((prev) => (prev?.id === row.id ? null : prev));
        setSelectedIds((prev) => {
          if (!prev.has(row.id)) return prev;
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }
    },
  });

  const drawerActions = useMemo(
    () => ({
      getAvailableActions: actionEngine.getAvailableActions,
      requestAction: actionEngine.requestAction,
      executingId: actionEngine.executingId,
    }),
    [actionEngine.getAvailableActions, actionEngine.requestAction, actionEngine.executingId],
  );

  const chooserColumns = useMemo(() => {
    const byName = new Map<string, OperationsColumnDefinition>();
    for (const column of CLINIC_COLUMNS) byName.set(column.internalName, column);
    for (const column of columns) byName.set(column.internalName, column);
    return OPERATOR_COLUMN_ORDER.filter((name) => name !== "actions")
      .map((name) => byName.get(name))
      .filter(Boolean) as OperationsColumnDefinition[];
  }, [columns]);

  const gridColumns = useMemo(() => {
    const source = config?.columns?.length ? config.columns : columns;
    return withOperatorColumns(source, t, templateKey, preferences.hiddenColumnIds ?? []);
  }, [columns, config?.columns, preferences.hiddenColumnIds, t, templateKey]);

  const rows = page?.rows ?? [];

  // Keep drawer sticky: refresh selected row from latest page data when queue updates.
  const activeRow = useMemo(() => {
    if (!selectedRow) return null;
    return rows.find((row) => row.id === selectedRow.id) ?? selectedRow;
  }, [rows, selectedRow]);

  const kpis = useMemo(
    () => resolveQueueKpis(config, rows, page?.total ?? rows.length, t, templateKey, companyCurrency),
    [companyCurrency, config, page?.total, rows, t, templateKey],
  );

  const datePreset = (String(query.filters?.datePreset ?? "today") as QueueDatePreset) || "today";
  const dateFrom = String(query.filters?.dateFrom ?? "");
  const dateTo = String(query.filters?.dateTo ?? "");
  const queueTimezone = resolveQueueTimezone(
    typeof query.filters?.timezone === "string" ? query.filters.timezone : null,
    profile?.timezone ?? null,
  );

  const updateFilters = useCallback(
    (patch: Record<string, unknown>) => {
      setQuery((prev) => ({
        ...prev,
        page: 1,
        filters: {
          ...(prev.filters ?? {}),
          ...patch,
        },
      }));
    },
    [setQuery],
  );

  const applyDatePreset = useCallback(
    (preset: QueueDatePreset, customFrom?: string, customTo?: string) => {
      const range = resolveQueueDateRange(preset, customFrom, customTo, queueTimezone);
      updateFilters({ ...range, timezone: queueTimezone });
    },
    [queueTimezone, updateFilters],
  );

  const toggleColumn = useCallback(
    (columnId: string) => {
      setPreferences((prev) => {
        const hidden = new Set(prev.hiddenColumnIds ?? []);
        if (hidden.has(columnId)) hidden.delete(columnId);
        else hidden.add(columnId);
        return { ...prev, hiddenColumnIds: [...hidden] };
      });
    },
    [setPreferences],
  );

  const filterOptions = useMemo(() => {
    const doctors = new Set<string>();
    const services = new Set<string>();
    const branches = new Set<string>();
    for (const row of rows) {
      const doctor = String(row.values.resource ?? "").trim();
      const service = String(row.values.service ?? "").trim();
      const branch = String(row.values.branch ?? "").trim();
      if (doctor && doctor !== "—") doctors.add(doctor);
      if (service && service !== "—") services.add(service);
      if (branch && branch !== "—") branches.add(branch);
    }
    for (const resource of config?.resources ?? []) {
      if (resource.active !== false && resource.name) doctors.add(resource.name);
    }
    for (const service of config?.services ?? []) {
      if (service.active !== false && service.name) services.add(service.name);
    }
    return {
      doctors: [...doctors].sort((a, b) => a.localeCompare(b)),
      services: [...services].sort((a, b) => a.localeCompare(b)),
      branches: [...branches].sort((a, b) => a.localeCompare(b)),
      statuses: (config?.statuses ?? []).filter((status) => status.internalName !== "archived"),
    };
  }, [config?.resources, config?.services, config?.statuses, rows]);

  return (
    <div className="flex h-[calc(100vh-5.5rem)] min-h-[32rem] w-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 items-end justify-between gap-3 border-b border-border/60 pb-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            {t("universalOperations.queue.title")}
          </h1>
          <p className="max-w-lg text-[13px] leading-5 text-muted-foreground">
            {t("universalOperations.queue.subtitleEnterprise")}
          </p>
        </div>
        <Button size="sm" className="h-9 shrink-0 gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold shadow-none" onClick={() => setBookingModalOpen(true)}>
          <Plus className="size-3.5" strokeWidth={2.5} />
          {t("universalOperations.queue.newOperation")}
        </Button>
      </header>

      <QueueKpiStrip kpis={kpis} />

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-background">
        <OperationsDataGrid
          columns={gridColumns}
          rows={rows}
          loading={loading}
          search={query.search ?? ""}
          onSearchChange={updateSearch}
          sort={query.sort ?? []}
          onSortChange={updateSort}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          activeRowId={activeRow?.id ?? null}
          onRowClick={openAppointmentDrawer}
          onRowDoubleClick={openAppointmentDrawer}
          onLoadMore={loadMore}
          hasMore={page?.hasMore}
          density={preferences.density === "spacious" ? "comfortable" : preferences.density}
          onDensityChange={(density) => setPreferences((prev) => ({ ...prev, density }))}
          className="min-h-0 min-w-0 flex-1 border-0 shadow-none"
          templateKey={templateKey}
          config={config}
          currencyCode={companyCurrency}
          datePreset={datePreset}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDatePresetChange={applyDatePreset}
          filters={{
            doctor: String(query.filters?.resource ?? "all"),
            service: String(query.filters?.service ?? "all"),
            status: String(query.filters?.statusId ?? "all"),
            branch: String(query.filters?.branch ?? "all"),
          }}
          filterOptions={filterOptions}
          onFiltersChange={(next) =>
            updateFilters({
              resource: next.doctor === "all" ? undefined : next.doctor,
              service: next.service === "all" ? undefined : next.service,
              statusId: next.status === "all" ? undefined : next.status,
              branch: next.branch === "all" ? undefined : next.branch,
            })
          }
          onApplySavedView={(view) => {
            if (view === "today") {
              const range = resolveQueueDateRange("today", null, null, queueTimezone);
              updateFilters({
                ...range,
                timezone: queueTimezone,
                statusId: undefined,
                paymentStatusId: undefined,
                resource: undefined,
                service: undefined,
                branch: undefined,
              });
              return;
            }
            if (view === "waiting") {
              updateFilters({ statusId: "st_waiting", paymentStatusId: undefined });
              return;
            }
            if (view === "unpaid") {
              updateFilters({ paymentStatusId: "pay_pending", statusId: undefined });
            }
          }}
          onRefresh={() => {
            void refetch();
          }}
          isRefreshing={isFetching}
          columnChooserColumns={chooserColumns}
          hiddenColumnIds={preferences.hiddenColumnIds ?? []}
          onToggleColumn={toggleColumn}
          renderRowActions={(row) => (
            <OperationsRowActionsMenu
              row={row}
              groups={actionEngine.getAvailableActionGroups(row)}
              executingId={actionEngine.executingId}
              onSelect={actionEngine.requestAction}
            />
          )}
        />

        <OperationsWorkspacePanel
          row={activeRow}
          rows={rows}
          open={Boolean(selectedRow)}
          onClose={() => setSelectedRow(null)}
          onSelectRow={openAppointmentDrawer}
          templateKey={templateKey}
          config={config}
          actions={drawerActions}
          presentation="inline"
        />
      </div>

      <ActionConfirmationDialog
        open={Boolean(actionEngine.pendingConfirmation)}
        action={actionEngine.pendingConfirmation?.action ?? null}
        busy={Boolean(actionEngine.executingId)}
        onConfirm={actionEngine.confirmPendingAction}
        onCancel={actionEngine.cancelPendingAction}
      />

      <CollectPaymentDialog
        open={Boolean(actionEngine.pendingPaymentRow)}
        row={actionEngine.pendingPaymentRow}
        busy={actionEngine.executingId === "billing.collect_payment"}
        onConfirm={actionEngine.confirmCollectPayment}
        onCancel={actionEngine.cancelCollectPayment}
      />

      <BookingModal
        open={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        customers={customers}
        companyId={profile?.company_id ?? null}
      />
    </div>
  );
}
