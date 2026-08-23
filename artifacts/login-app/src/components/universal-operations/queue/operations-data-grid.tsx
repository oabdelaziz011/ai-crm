import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Download,
  RefreshCw,
  Search,
} from "lucide-react";
import type {
  OperationsColumnDefinition,
  OperationsRow,
  OperationsSortState,
  OperationsWorkspaceConfig,
} from "@workspace/universal-operations-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatOperationsQueueMoney,
  resolveOperationsPaymentColor,
  resolveOperationsStatusColor,
  resolveOperationsVisitTypeColor,
  translateOperationsPaymentLabel,
  translateOperationsQueueColumnHeader,
  translateOperationsStatusLabel,
  translateOperationsVisitTypeLabel,
} from "@/lib/i18n/operations-queue-labels";
import {
  formatAppointmentDate,
  formatAppointmentTime,
  formatDurationMinutes,
  formatWaitingDuration,
  type QueueDatePreset,
} from "@/lib/universal-operations/operations-queue-date-range";
import {
  PRIORITY_COLORS,
  resolveAppointmentTiming,
  resolvePriorityDisplay,
} from "@/lib/universal-operations/appointment-timing";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const CHECKBOX_WIDTH = 40;
const DENSITY_ROW_HEIGHT = {
  compact: 44,
  comfortable: 52,
  spacious: 60,
} as const;

function computeWindow(scrollTop: number, viewportHeight: number, count: number, rowHeight: number) {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 4);
  const visible = Math.ceil(viewportHeight / rowHeight) + 8;
  const end = Math.min(count, start + visible);
  return { start, end, offsetY: start * rowHeight, totalHeight: count * rowHeight };
}

function formatCellValue(value: unknown, type: string): string {
  if (value == null || value === "") return "—";
  if (type === "datetime") {
    try {
      return new Date(String(value)).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    } catch {
      return String(value);
    }
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function StatusPill({ label, color }: { label: string; color?: string }) {
  const style = color
    ? { backgroundColor: `${color}22`, color }
    : {
        backgroundColor: "hsl(var(--primary) / 0.13)",
        color: "hsl(var(--primary))",
      };
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide"
      style={style}
    >
      {label}
    </span>
  );
}

function buildStickyOffsets(columns: OperationsColumnDefinition[]) {
  const leftOffsets = new Map<string, number>();
  let left = CHECKBOX_WIDTH;
  for (const column of columns.filter((c) => c.pinned === "left")) {
    leftOffsets.set(column.id, left);
    left += column.width;
  }

  const rightOffsets = new Map<string, number>();
  let right = 0;
  const pinnedRight = columns.filter((c) => c.pinned === "right");
  for (let i = pinnedRight.length - 1; i >= 0; i -= 1) {
    const column = pinnedRight[i]!;
    rightOffsets.set(column.id, right);
    right += column.width;
  }

  return { leftOffsets, rightOffsets };
}

export type QueueGridFilters = {
  doctor: string;
  service: string;
  status: string;
  branch: string;
};

export type OperationsDataGridProps = {
  columns: OperationsColumnDefinition[];
  rows: OperationsRow[];
  loading?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  sort: OperationsSortState[];
  onSortChange: (sort: OperationsSortState[]) => void;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onRowClick: (row: OperationsRow) => void;
  onRowDoubleClick?: (row: OperationsRow) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  density?: "compact" | "comfortable" | "spacious";
  onDensityChange?: (density: "compact" | "comfortable" | "spacious") => void;
  className?: string;
  templateKey?: string;
  config?: OperationsWorkspaceConfig | null;
  currencyCode?: string;
  renderRowActions?: (row: OperationsRow) => ReactNode;
  datePreset?: QueueDatePreset;
  dateFrom?: string;
  dateTo?: string;
  onDatePresetChange?: (preset: QueueDatePreset, customFrom?: string, customTo?: string) => void;
  filters?: QueueGridFilters;
  filterOptions?: {
    doctors: string[];
    services: string[];
    branches: string[];
    statuses: Array<{ id: string; displayName: string; internalName: string }>;
  };
  onFiltersChange?: (filters: QueueGridFilters) => void;
  onApplySavedView?: (view: "today" | "waiting" | "unpaid") => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  columnChooserColumns?: OperationsColumnDefinition[];
  hiddenColumnIds?: string[];
  onToggleColumn?: (columnId: string) => void;
  activeRowId?: string | null;
};

export function OperationsDataGrid({
  columns,
  rows,
  loading,
  search,
  onSearchChange,
  sort,
  onSortChange,
  selectedIds,
  onSelectionChange,
  onRowClick,
  onRowDoubleClick,
  onLoadMore,
  hasMore,
  density = "comfortable",
  onDensityChange,
  className,
  templateKey = "clinic",
  config = null,
  currencyCode = "USD",
  renderRowActions,
  datePreset = "today",
  dateFrom = "",
  dateTo = "",
  onDatePresetChange,
  filters,
  filterOptions,
  onFiltersChange,
  onApplySavedView,
  onRefresh,
  isRefreshing,
  columnChooserColumns,
  hiddenColumnIds = [],
  onToggleColumn,
  activeRowId = null,
}: OperationsDataGridProps) {
  const { t } = useTranslation("common");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);

  const handleRowClick = useCallback(
    (row: OperationsRow) => {
      onRowClick(row);
    },
    [onRowClick],
  );

  const handleRowDoubleClick = useCallback(
    (row: OperationsRow, event: MouseEvent<HTMLTableRowElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (onRowDoubleClick) {
        onRowDoubleClick(row);
        return;
      }
      onRowClick(row);
    },
    [onRowClick, onRowDoubleClick],
  );

  const columnLabel = (column: OperationsColumnDefinition) =>
    translateOperationsQueueColumnHeader(t, column.internalName, templateKey, column.displayName);

  const rowHeight = DENSITY_ROW_HEIGHT[density] ?? DENSITY_ROW_HEIGHT.comfortable;
  const window = useMemo(
    () => computeWindow(scrollTop, viewportHeight, rows.length, rowHeight),
    [scrollTop, viewportHeight, rows.length, rowHeight],
  );

  const pinnedLeft = columns.filter((c) => c.pinned === "left");
  const scrollable = columns.filter((c) => c.pinned !== "left" && c.pinned !== "right");
  const pinnedRight = columns.filter((c) => c.pinned === "right");
  const orderedColumns = [...pinnedLeft, ...scrollable, ...pinnedRight];
  const { leftOffsets, rightOffsets } = useMemo(() => buildStickyOffsets(columns), [columns]);

  const stickyStyle = (column: OperationsColumnDefinition): CSSProperties => {
    const style: CSSProperties = {
      width: column.width,
      minWidth: column.width,
      maxWidth: column.width,
    };
    if (column.pinned === "left") {
      style.left = leftOffsets.get(column.id) ?? CHECKBOX_WIDTH;
    }
    if (column.pinned === "right") {
      style.right = rightOffsets.get(column.id) ?? 0;
    }
    return style;
  };

  const toggleSort = (column: OperationsColumnDefinition) => {
    if (!column.sortable) return;
    const existing = sort.find((s) => s.columnId === column.id);
    if (!existing) {
      onSortChange([{ columnId: column.id, direction: "asc" }]);
      return;
    }
    if (existing.direction === "asc") {
      onSortChange([{ columnId: column.id, direction: "desc" }]);
      return;
    }
    onSortChange([{ columnId: "col_scheduled", direction: "asc" }]);
  };

  const toggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === rows.length) onSelectionChange(new Set());
    else onSelectionChange(new Set(rows.map((r) => r.id)));
  };

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setViewportHeight(el.clientHeight);
    if (hasMore && onLoadMore && el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportHeight(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const exportCsv = () => {
    const exportable = orderedColumns.filter((column) => column.internalName !== "actions");
    const header = exportable.map((column) => columnLabel(column));
    const lines = rows.map((row) =>
      exportable
        .map((column) => {
          const raw = row.values[column.internalName];
          let text = formatCellValue(raw, column.type);
          if (column.internalName === "appointment_time") text = formatAppointmentTime(raw ?? row.values.scheduled_at);
          if (column.internalName === "scheduled_at") text = formatAppointmentDate(raw ?? row.values.appointment_time);
          if (column.internalName === "waiting_minutes") text = formatWaitingDuration(raw);
          if (column.internalName === "duration_minutes") text = formatDurationMinutes(raw);
          if (column.internalName === "amount") {
            const rowCurrency = String(row.values.currency ?? currencyCode);
            text = formatOperationsQueueMoney(t, Number(raw) || 0, rowCurrency);
          }
          if (column.internalName === "visit_type") text = translateOperationsVisitTypeLabel(t, raw);
          return `"${String(text).replace(/"/g, '""')}"`;
        })
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `operations-queue-${dateFrom || "export"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const renderHeaderCell = (column: OperationsColumnDefinition) => {
    const activeSort = sort.find((s) => s.columnId === column.id);
    const isActions = column.internalName === "actions";
    const label = columnLabel(column);
    return (
      <th
        key={column.id}
        className={cn(
          "sticky top-0 z-20 border-b border-border/60 bg-background px-2.5 py-1.5 text-left text-[10px] font-bold tracking-wide text-muted-foreground",
          column.pinned === "left" && "z-30 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.25)]",
          column.pinned === "right" && "z-30 shadow-[-2px_0_6px_-2px_rgba(0,0,0,0.25)]",
          column.alignment === "center" && "text-center",
          column.alignment === "end" && "text-end",
        )}
        style={stickyStyle(column)}
      >
        {isActions ? (
          <span className="sr-only">{label}</span>
        ) : (
          <button
            type="button"
            className={cn(
              "flex w-full min-w-0 items-center gap-1 hover:text-foreground",
              column.sortable && "cursor-pointer",
              column.alignment === "center" && "justify-center",
              column.alignment === "end" && "justify-end",
            )}
            onClick={() => toggleSort(column)}
          >
            <span className="truncate normal-case">{label}</span>
            {column.sortable &&
              (activeSort ? (
                activeSort.direction === "asc" ? (
                  <ArrowUp className="size-3 shrink-0" />
                ) : (
                  <ArrowDown className="size-3 shrink-0" />
                )
              ) : (
                <ArrowUpDown className="size-3 shrink-0 opacity-40" />
              ))}
          </button>
        )}
      </th>
    );
  };

  const renderCell = (row: OperationsRow, column: OperationsColumnDefinition) => {
    const raw = row.values[column.internalName];
    const isReference = column.internalName === "reference";
    const isActions = column.internalName === "actions";
    const rowCurrency = String(row.values.currency ?? currencyCode ?? "USD");

    let text = formatCellValue(raw, column.type);
    let pillColor: string | undefined;

    const timing = resolveAppointmentTiming(row);
    const priority = resolvePriorityDisplay(row.priority);

    if (column.internalName === "queue_number") {
      text = String(raw ?? "—");
    } else if (column.internalName === "scheduled_at") {
      text = formatAppointmentDate(raw ?? row.values.appointment_time);
    } else if (column.internalName === "appointment_time") {
      text = formatAppointmentTime(raw ?? row.values.scheduled_at);
    } else if (column.internalName === "waiting_minutes") {
      text = formatWaitingDuration(raw);
    } else if (column.internalName === "duration_minutes") {
      text = formatDurationMinutes(raw);
    } else if (column.type === "currency" || column.internalName === "amount") {
      text = formatOperationsQueueMoney(t, Number(raw) || 0, rowCurrency);
    } else if (column.type === "status" || column.internalName === "status") {
      text = translateOperationsStatusLabel(t, row.statusId, raw, config);
      pillColor = resolveOperationsStatusColor(row.statusId, raw, config);
    } else if (column.type === "payment" || column.internalName === "payment_status") {
      text = translateOperationsPaymentLabel(t, row.paymentStatusId, raw, config);
      pillColor = resolveOperationsPaymentColor(row.paymentStatusId, raw, config);
    } else if (column.internalName === "visit_type") {
      text = translateOperationsVisitTypeLabel(t, raw);
      pillColor = resolveOperationsVisitTypeColor(raw);
    }

    const timingBadge =
      timing.kind === "late" ? (
        <span className="shrink-0 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-400">
          {t("universalOperations.appointment.lateMinutes", {
            defaultValue: "Late {{minutes}} min",
            minutes: timing.minutes,
          })}
        </span>
      ) : timing.kind === "starting_soon" ? (
        <span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
          {t("universalOperations.appointment.startingSoon", { defaultValue: "Starting Soon" })}
        </span>
      ) : null;

    return (
      <td
        key={`${row.id}-${column.id}`}
        className={cn(
          "border-b border-border/40 px-2.5 align-middle text-sm",
          density === "compact" ? "py-0" : "py-1",
          column.pinned === "left" && "sticky z-10 bg-background shadow-[2px_0_6px_-2px_rgba(0,0,0,0.15)]",
          column.pinned === "right" && "sticky z-10 bg-background shadow-[-2px_0_6px_-2px_rgba(0,0,0,0.15)]",
          column.alignment === "center" && "text-center",
          column.alignment === "end" && "text-end",
        )}
        style={stickyStyle(column)}
      >
        {isActions ? (
          <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
            {renderRowActions?.(row) ?? null}
          </div>
        ) : isReference ? (
          <button
            type="button"
            className="block max-w-full truncate font-medium text-primary underline-offset-2 hover:underline"
            title={t("universalOperations.grid.tooltips.openRow")}
            onClick={(e) => {
              e.stopPropagation();
              onRowClick(row);
            }}
          >
            {text}
          </button>
        ) : column.internalName === "appointment_time" ? (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate tabular-nums">{text}</span>
            {timingBadge}
          </div>
        ) : column.internalName === "customer" ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{text}</span>
            <span
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: `${PRIORITY_COLORS[priority]}22`,
                color: PRIORITY_COLORS[priority],
              }}
            >
              {t(`universalOperations.appointment.priority.${priority}`, { defaultValue: priority })}
            </span>
          </div>
        ) : column.type === "status" ||
          column.type === "payment" ||
          column.internalName === "status" ||
          column.internalName === "payment_status" ||
          column.internalName === "visit_type" ? (
          <StatusPill label={text} color={pillColor} />
        ) : (
          <span className="block truncate tabular-nums">{text}</span>
        )}
      </td>
    );
  };

  const visibleRows = rows.slice(window.start, window.end);
  const activeFilters = filters ?? { doctor: "all", service: "all", status: "all", branch: "all" };

  return (
    <TooltipProvider delayDuration={250}>
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-background", className)}>
        <div className="flex shrink-0 flex-col gap-1.5 border-b border-border/60 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={t("universalOperations.grid.searchPlaceholder")}
                title={t("universalOperations.grid.tooltips.search")}
                aria-label={t("universalOperations.grid.tooltips.search")}
                className="h-8 pl-8 text-sm"
              />
            </div>

            <Select
              value={datePreset}
              onValueChange={(value) => onDatePresetChange?.(value as QueueDatePreset, dateFrom, dateTo)}
            >
              <SelectTrigger className="h-8 w-[8.5rem]" aria-label={t("universalOperations.grid.dateFilter")}>
                <SelectValue placeholder={t("universalOperations.grid.dateFilter")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">{t("universalOperations.grid.datePresets.today")}</SelectItem>
                <SelectItem value="tomorrow">{t("universalOperations.grid.datePresets.tomorrow")}</SelectItem>
                <SelectItem value="yesterday">{t("universalOperations.grid.datePresets.yesterday")}</SelectItem>
                <SelectItem value="this_week">{t("universalOperations.grid.datePresets.thisWeek")}</SelectItem>
                <SelectItem value="this_month">{t("universalOperations.grid.datePresets.thisMonth")}</SelectItem>
                <SelectItem value="custom">{t("universalOperations.grid.datePresets.custom")}</SelectItem>
              </SelectContent>
            </Select>

            {datePreset === "custom" && (
              <>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => onDatePresetChange?.("custom", e.target.value, dateTo || e.target.value)}
                  className="h-8 w-[9.5rem] text-sm"
                  aria-label={t("universalOperations.grid.dateFrom")}
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => onDatePresetChange?.("custom", dateFrom || e.target.value, e.target.value)}
                  className="h-8 w-[9.5rem] text-sm"
                  aria-label={t("universalOperations.grid.dateTo")}
                />
              </>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 px-2.5"
                  onClick={() => onRefresh?.()}
                  disabled={!onRefresh || isRefreshing}
                  aria-label={t("universalOperations.grid.tooltips.refresh", { defaultValue: "Refresh" })}
                >
                  <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
                  <span className="hidden sm:inline">{t("universalOperations.grid.refresh", { defaultValue: "Refresh" })}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("universalOperations.grid.tooltips.refresh", { defaultValue: "Refresh" })}</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-2.5">
                  {t("universalOperations.grid.savedViews")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => onApplySavedView?.("today")}>
                  {t("universalOperations.grid.viewToday")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onApplySavedView?.("waiting")}>
                  {t("universalOperations.grid.viewWaiting")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onApplySavedView?.("unpaid")}>
                  {t("universalOperations.grid.viewUnpaid")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 px-2.5"
                  onClick={exportCsv}
                  aria-label={t("universalOperations.grid.tooltips.export")}
                >
                  <Download className="size-3.5" />
                  <span className="hidden sm:inline">{t("universalOperations.grid.export")}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("universalOperations.grid.tooltips.export")}</TooltipContent>
            </Tooltip>

            {columnChooserColumns && onToggleColumn && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5"
                    aria-label={t("universalOperations.grid.tooltips.columns", { defaultValue: "Columns" })}
                  >
                    <Columns3 className="size-3.5" />
                    <span className="hidden sm:inline">
                      {t("universalOperations.grid.columnChooser", { defaultValue: "Columns" })}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                  {columnChooserColumns.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={!hiddenColumnIds.includes(column.id)}
                      onCheckedChange={() => onToggleColumn(column.id)}
                    >
                      {columnLabel(column)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {onDensityChange && (
              <Select value={density} onValueChange={(v) => onDensityChange(v as "compact" | "comfortable" | "spacious")}>
                <SelectTrigger className="h-8 w-[7.5rem]" aria-label={t("universalOperations.grid.tooltips.density")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">{t("universalOperations.grid.densityCompact")}</SelectItem>
                  <SelectItem value="comfortable">{t("universalOperations.grid.densityComfortable")}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Select
              value={activeFilters.doctor}
              onValueChange={(value) => onFiltersChange?.({ ...activeFilters, doctor: value })}
            >
              <SelectTrigger className="h-8 w-[9rem]">
                <SelectValue placeholder={t("universalOperations.grid.filters.doctor")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("universalOperations.grid.filters.allDoctors")}</SelectItem>
                {(filterOptions?.doctors ?? []).map((doctor) => (
                  <SelectItem key={doctor} value={doctor}>
                    {doctor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={activeFilters.service}
              onValueChange={(value) => onFiltersChange?.({ ...activeFilters, service: value })}
            >
              <SelectTrigger className="h-8 w-[9rem]">
                <SelectValue placeholder={t("universalOperations.grid.filters.service")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("universalOperations.grid.filters.allServices")}</SelectItem>
                {(filterOptions?.services ?? []).map((service) => (
                  <SelectItem key={service} value={service}>
                    {service}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={activeFilters.status}
              onValueChange={(value) => onFiltersChange?.({ ...activeFilters, status: value })}
            >
              <SelectTrigger className="h-8 w-[9rem]">
                <SelectValue placeholder={t("universalOperations.grid.filters.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("universalOperations.grid.filters.allStatuses")}</SelectItem>
                {(filterOptions?.statuses ?? []).map((status) => (
                  <SelectItem key={status.id} value={status.id}>
                    {translateOperationsStatusLabel(t, status.id, status.displayName, config)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={activeFilters.branch}
              onValueChange={(value) => onFiltersChange?.({ ...activeFilters, branch: value })}
            >
              <SelectTrigger className="h-8 w-[9rem]">
                <SelectValue placeholder={t("universalOperations.grid.filters.branch")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("universalOperations.grid.filters.allBranches")}</SelectItem>
                {(filterOptions?.branches ?? []).map((branch) => (
                  <SelectItem key={branch} value={branch}>
                    {branch}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="relative min-h-0 flex-1 overflow-auto"
          role="grid"
          aria-rowcount={rows.length}
        >
          {!loading && rows.length === 0 ? (
            <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-1 px-6 text-center">
              <p className="text-sm font-medium text-foreground">{t("universalOperations.queue.empty.title")}</p>
              <p className="max-w-sm text-xs text-muted-foreground">{t("universalOperations.queue.empty.description")}</p>
            </div>
          ) : (
            <table className="w-max min-w-full table-fixed border-collapse">
              <thead>
                <tr>
                  <th
                    className="sticky left-0 top-0 z-40 border-b border-border/60 bg-background px-2 py-1.5"
                    style={{ width: CHECKBOX_WIDTH, minWidth: CHECKBOX_WIDTH, maxWidth: CHECKBOX_WIDTH }}
                  >
                    <Checkbox
                      checked={rows.length > 0 && selectedIds.size === rows.length}
                      onCheckedChange={toggleAll}
                      aria-label={t("universalOperations.grid.selectAll")}
                    />
                  </th>
                  {orderedColumns.map(renderHeaderCell)}
                </tr>
              </thead>
              <tbody style={{ height: window.totalHeight }}>
                <tr style={{ height: window.offsetY }} aria-hidden />
                {visibleRows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-primary/5",
                      selectedIds.has(row.id) && "bg-primary/8",
                      activeRowId === row.id && "bg-primary/10 ring-1 ring-inset ring-primary/25",
                    )}
                    style={{ height: rowHeight }}
                    onClick={() => handleRowClick(row)}
                    onDoubleClick={(event) => handleRowDoubleClick(row, event)}
                  >
                    <td
                      className="sticky left-0 z-10 border-b border-border/40 bg-background px-2 align-middle"
                      style={{ width: CHECKBOX_WIDTH, minWidth: CHECKBOX_WIDTH, maxWidth: CHECKBOX_WIDTH }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={() => toggleRow(row.id)}
                        aria-label={t("universalOperations.grid.tooltips.selectRow")}
                      />
                    </td>
                    {orderedColumns.map((col) => renderCell(row, col))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
              <span className="text-sm text-muted-foreground">{t("universalOperations.loading")}</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
          <span>{t("universalOperations.grid.rowCount", { count: rows.length })}</span>
          {selectedIds.size > 0 && (
            <span>{t("universalOperations.grid.selectedCount", { count: selectedIds.size })}</span>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
