import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Download,
  Filter,
  MoreHorizontal,
  Pin,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import type { OperationsColumnDefinition } from "@workspace/universal-operations-engine";
import type { OperationsRow, OperationsSortState } from "@workspace/universal-operations-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const ROW_HEIGHT = 44;

function computeWindow(scrollTop: number, viewportHeight: number, count: number) {
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4);
  const visible = Math.ceil(viewportHeight / ROW_HEIGHT) + 8;
  const end = Math.min(count, start + visible);
  return { start, end, offsetY: start * ROW_HEIGHT, totalHeight: count * ROW_HEIGHT };
}

function formatCellValue(value: unknown, type: string): string {
  if (value == null || value === "") return "—";
  if (type === "currency") return `$${(Number(value) / 100).toFixed(2)}`;
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
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: `${color ?? "#6366f1"}22`, color: color ?? "#6366f1" }}
    >
      {label}
    </span>
  );
}

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
  onLoadMore?: () => void;
  hasMore?: boolean;
  density?: "compact" | "comfortable" | "spacious";
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
  onLoadMore,
  hasMore,
  density = "comfortable",
}: OperationsDataGridProps) {
  const { t } = useTranslation("common");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);

  const rowHeight = density === "compact" ? 36 : density === "spacious" ? 52 : ROW_HEIGHT;
  const window = useMemo(
    () => computeWindow(scrollTop, viewportHeight, rows.length),
    [scrollTop, viewportHeight, rows.length],
  );

  const pinnedLeft = columns.filter((c) => c.pinned === "left");
  const scrollable = columns.filter((c) => c.pinned !== "left" && c.pinned !== "right");
  const pinnedRight = columns.filter((c) => c.pinned === "right");
  const orderedColumns = [...pinnedLeft, ...scrollable, ...pinnedRight];

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
    onSortChange([]);
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

  const renderHeaderCell = (column: OperationsColumnDefinition) => {
    const activeSort = sort.find((s) => s.columnId === column.id);
    return (
      <th
        key={column.id}
        className={cn(
          "sticky top-0 z-20 border-b border-border/60 bg-card/95 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur",
          column.pinned === "left" && "left-0 z-30 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.25)]",
          column.alignment === "center" && "text-center",
          column.alignment === "end" && "text-end",
        )}
        style={{ width: column.width, minWidth: column.minWidth ?? column.width }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={cn("flex min-w-0 flex-1 items-center gap-1 hover:text-foreground", column.sortable && "cursor-pointer")}
            onClick={() => toggleSort(column)}
          >
            <span className="truncate">{column.displayName}</span>
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="rounded p-0.5 hover:bg-muted/50" aria-label={t("universalOperations.grid.columnSettings")}>
                <MoreHorizontal className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>{column.displayName}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!column.sortable}>
                <ArrowUpDown className="mr-2 size-3.5" /> {t("universalOperations.grid.sort")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!column.filterable}>
                <Filter className="mr-2 size-3.5" /> {t("universalOperations.grid.filter")}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Pin className="mr-2 size-3.5" /> {t("universalOperations.grid.pin")}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Columns3 className="mr-2 size-3.5" /> {t("universalOperations.grid.hide")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </th>
    );
  };

  const renderCell = (row: OperationsRow, column: OperationsColumnDefinition) => {
    const raw = row.values[column.internalName];
    const text = formatCellValue(raw, column.type);
    return (
      <td
        key={`${row.id}-${column.id}`}
        className={cn(
          "border-b border-border/40 px-3 py-2 text-sm",
          column.pinned === "left" && "sticky left-0 z-10 bg-card/95 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.15)]",
          column.alignment === "center" && "text-center",
          column.alignment === "end" && "text-end",
        )}
        style={{ width: column.width, minWidth: column.minWidth ?? column.width }}
      >
        {column.type === "status" || column.type === "payment" ? (
          <StatusPill label={text} color={column.type === "payment" && text === "Paid" ? "#22c55e" : "#6366f1"} />
        ) : (
          <span className="block truncate">{text}</span>
        )}
      </td>
    );
  };

  const visibleRows = rows.slice(window.start, window.end);

  return (
    <div className="flex flex-col rounded-xl border border-border/70 bg-card/85 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("universalOperations.grid.searchPlaceholder")}
            className="h-9 pl-9"
          />
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled>
          <Sparkles className="size-3.5" />
          {t("universalOperations.grid.aiSearch")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              {t("universalOperations.grid.savedViews")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>{t("universalOperations.grid.viewToday")}</DropdownMenuItem>
            <DropdownMenuItem>{t("universalOperations.grid.viewWaiting")}</DropdownMenuItem>
            <DropdownMenuItem>{t("universalOperations.grid.viewUnpaid")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={selectedIds.size === 0}>
          {t("universalOperations.grid.bulkActions")}
        </Button>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <Download className="size-3.5" />
          {t("universalOperations.grid.export")}
        </Button>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <Upload className="size-3.5" />
          {t("universalOperations.grid.import")}
        </Button>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative max-h-[calc(100vh-18rem)] overflow-auto"
        role="grid"
        aria-rowcount={rows.length}
      >
        <table className="w-max min-w-full border-collapse">
          <thead>
            <tr>
              <th
                className="sticky left-0 top-0 z-40 w-10 border-b border-border/60 bg-card/95 px-2 py-2 backdrop-blur"
                style={{ width: 40 }}
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
                )}
                style={{ height: rowHeight }}
                onClick={() => onRowClick(row)}
              >
                <td
                  className="sticky left-0 z-10 border-b border-border/40 bg-card/95 px-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox checked={selectedIds.has(row.id)} onCheckedChange={() => toggleRow(row.id)} />
                </td>
                {orderedColumns.map((col) => renderCell(row, col))}
              </tr>
            ))}
          </tbody>
        </table>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
            <span className="text-sm text-muted-foreground">{t("universalOperations.loading")}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
        <span>{t("universalOperations.grid.rowCount", { count: rows.length })}</span>
        {selectedIds.size > 0 && (
          <span>{t("universalOperations.grid.selectedCount", { count: selectedIds.size })}</span>
        )}
      </div>
    </div>
  );
}
