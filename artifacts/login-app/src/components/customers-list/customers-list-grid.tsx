import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  DENSITY_ROW_HEIGHT,
  useVirtualWindow,
  type CustomerColumnId,
  type CustomerListDensity,
  type EnrichedCustomerRow,
} from "@/lib/customers-list";
import { CustomersListRow } from "./customers-list-row";

type CustomersListGridProps = {
  rows: EnrichedCustomerRow[];
  density: CustomerListDensity;
  columnOrder: CustomerColumnId[];
  columnVisibility: Record<CustomerColumnId, boolean>;
  columnWidths: Partial<Record<CustomerColumnId, number>>;
  onColumnResize: (columnId: CustomerColumnId, width: number) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onOpenCustomer: (id: string) => void;
  onEditCustomer?: (row: EnrichedCustomerRow) => void;
  onDeleteCustomer?: (row: EnrichedCustomerRow) => void;
  onQuickAction: (
    row: EnrichedCustomerRow,
    action: "call" | "whatsapp" | "email" | "booking" | "invoice" | "profile",
  ) => void;
};

const HEADER_LABEL_KEYS: Record<CustomerColumnId, string> = {
  select: "",
  customer: "dashboard.customers.list.columns.customer",
  tags: "dashboard.customers.list.columns.tags",
  company: "dashboard.customers.list.columns.company",
  phone: "dashboard.customers.list.columns.phone",
  email: "dashboard.customers.list.columns.email",
  assigned: "dashboard.customers.list.columns.assigned",
  nextAppointment: "dashboard.customers.list.columns.nextAppointment",
  outstanding: "dashboard.customers.list.columns.outstanding",
  ltv: "dashboard.customers.list.columns.ltv",
  status: "dashboard.customers.list.columns.status",
  lastActivity: "dashboard.customers.list.columns.lastActivity",
  actions: "dashboard.customers.list.columns.actions",
};

/** Must stay in sync with CustomersListRow visibility so headers never drift from cells. */
const COLUMN_VISIBILITY_CLASS: Partial<Record<CustomerColumnId, string>> = {
  tags: "hidden lg:flex",
  company: "hidden md:flex",
  phone: "hidden lg:flex",
  email: "hidden xl:flex",
  assigned: "hidden xl:flex",
  nextAppointment: "hidden lg:flex",
  outstanding: "hidden md:flex",
  ltv: "hidden md:flex",
  status: "hidden sm:flex",
  lastActivity: "hidden xl:flex",
};

export const CustomersListGrid = memo(function CustomersListGrid({
  rows,
  density,
  columnOrder,
  columnVisibility,
  columnWidths,
  onColumnResize,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onOpenCustomer,
  onEditCustomer,
  onDeleteCustomer,
  onQuickAction,
}: CustomersListGridProps) {
  const { t } = useTranslation("common");
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowHeight = DENSITY_ROW_HEIGHT[density];
  const { startIndex, endIndex, totalHeight, paddingTop, paddingBottom } = useVirtualWindow({
    count: rows.length,
    rowHeight,
    scrollRef,
  });

  const visibleColumns = useMemo(
    () => columnOrder.filter((id) => columnVisibility[id]),
    [columnOrder, columnVisibility],
  );

  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.customer.id));
  const someSelected = rows.some((row) => selectedIds.has(row.customer.id));

  const [resizing, setResizing] = useState<CustomerColumnId | null>(null);

  const startResize = useCallback(
    (columnId: CustomerColumnId, startX: number) => {
      const startWidth = columnWidths[columnId] ?? 120;
      setResizing(columnId);

      const onMove = (event: MouseEvent) => {
        const delta = event.clientX - startX;
        onColumnResize(columnId, startWidth + delta);
      };

      const onUp = () => {
        setResizing(null);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [columnWidths, onColumnResize],
  );

  const visibleRows = rows.slice(startIndex, endIndex);

  return (
    <div className="flex max-h-[min(68vh,720px)] min-h-[20rem] flex-col overflow-hidden rounded-xl border border-border/60 bg-background">
      <div className="sticky top-0 z-20 shrink-0 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex w-max min-w-full items-center px-0 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {visibleColumns.map((columnId) => {
            const width = columnWidths[columnId];
            const visibilityClass = COLUMN_VISIBILITY_CLASS[columnId];

            if (columnId === "select") {
              return (
                <div
                  key={columnId}
                  className="flex shrink-0 items-center justify-center px-2"
                  style={{ width, minWidth: width, maxWidth: width }}
                >
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => onToggleSelectAll(Boolean(checked))}
                    aria-label={t("dashboard.customers.list.selectAll")}
                    {...(someSelected && !allSelected ? { "data-state": "indeterminate" } : {})}
                  />
                </div>
              );
            }

            if (columnId === "actions") {
              return (
                <div
                  key={columnId}
                  className="flex shrink-0 items-center justify-center overflow-hidden px-1 text-center"
                  style={{ width, minWidth: width, maxWidth: width }}
                >
                  <span className="sr-only">{t(HEADER_LABEL_KEYS.actions)}</span>
                </div>
              );
            }

            return (
              <div
                key={columnId}
                className={cn("relative flex shrink-0 items-center truncate px-2", visibilityClass)}
                style={{ width, minWidth: width, maxWidth: width }}
              >
                {t(HEADER_LABEL_KEYS[columnId])}
                <button
                  type="button"
                  aria-label={t("dashboard.customers.list.resizeColumn")}
                  className={cn(
                    "absolute inset-y-0 end-0 w-1 cursor-col-resize hover:bg-primary/40",
                    resizing === columnId && "bg-primary/50",
                  )}
                  onMouseDown={(event) => startResize(columnId, event.clientX)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
        role="grid"
        aria-rowcount={rows.length}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <div style={{ paddingTop, paddingBottom }}>
            {visibleRows.map((row) => (
              <CustomersListRow
                key={row.customer.id}
                row={row}
                density={density}
                rowHeight={rowHeight}
                visibleColumns={visibleColumns}
                columnWidths={columnWidths}
                selected={selectedIds.has(row.customer.id)}
                onSelect={(checked) => onToggleSelect(row.customer.id, checked)}
                onOpen={() => onOpenCustomer(row.customer.id)}
                onEdit={onEditCustomer ? () => onEditCustomer(row) : undefined}
                onDelete={onDeleteCustomer ? () => onDeleteCustomer(row) : undefined}
                onQuickAction={(action) => onQuickAction(row, action)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
        {t("dashboard.customers.list.rowCount", { count: rows.length })}
      </div>
    </div>
  );
});
