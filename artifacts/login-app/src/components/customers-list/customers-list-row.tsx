import { memo, useCallback } from "react";
import {
  CalendarPlus,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Pencil,
  Trash2,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  customerInitials,
  fmtDate,
} from "@/lib/customer-workspace/customer-workspace-utils";
import {
  formatMoney,
  type CustomerColumnId,
  type CustomerListDensity,
  type EnrichedCustomerRow,
} from "@/lib/customers-list";

type CustomersListRowProps = {
  row: EnrichedCustomerRow;
  density: CustomerListDensity;
  rowHeight: number;
  visibleColumns: CustomerColumnId[];
  columnWidths: Partial<Record<CustomerColumnId, number>>;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onOpen: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onQuickAction: (action: "call" | "whatsapp" | "email" | "booking" | "invoice" | "profile") => void;
};

const STATUS_STYLES = {
  active: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
  inactive: "bg-muted text-muted-foreground border-border",
  at_risk: "bg-orange-500/15 text-orange-700 border-orange-500/20 dark:text-orange-400",
  new: "bg-blue-500/15 text-blue-700 border-blue-500/20 dark:text-blue-400",
} as const;

const COLUMN_VISIBILITY_CLASS: Partial<Record<CustomerColumnId, string>> = {
  tags: "hidden lg:flex",
  company: "hidden md:block",
  phone: "hidden lg:block",
  email: "hidden xl:block",
  assigned: "hidden xl:block",
  nextAppointment: "hidden lg:block",
  outstanding: "hidden md:block",
  ltv: "hidden md:block",
  status: "hidden sm:flex",
  lastActivity: "hidden xl:block",
};

export const CustomersListRow = memo(function CustomersListRow({
  row,
  density,
  rowHeight,
  visibleColumns,
  columnWidths,
  selected,
  onSelect,
  onOpen,
  onEdit,
  onDelete,
  onQuickAction,
}: CustomersListRowProps) {
  const { t } = useTranslation("common");
  const { customer } = row;

  const cellStyle = useCallback(
    (columnId: CustomerColumnId) => {
      const width = columnWidths[columnId];
      return {
        width,
        minWidth: width,
        maxWidth: width,
      };
    },
    [columnWidths],
  );

  const nameSize = density === "ultra" ? "text-sm" : density === "compact" ? "text-sm" : "text-[13px]";

  return (
    <div
      role="row"
      className={cn(
        "group flex w-max min-w-full items-stretch border-b border-border/40 transition-colors",
        "hover:bg-primary/5",
        selected && "bg-primary/8 hover:bg-primary/10",
      )}
      style={{ height: rowHeight }}
    >
      {visibleColumns.map((columnId) => {
        const widthStyle = cellStyle(columnId);
        const visibilityClass = COLUMN_VISIBILITY_CLASS[columnId];

        if (columnId === "select") {
          return (
            <div
              key={columnId}
              className="flex shrink-0 items-center justify-center px-2"
              style={widthStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={selected}
                onCheckedChange={(checked) => onSelect(Boolean(checked))}
                aria-label={t("dashboard.customers.list.selectRow", { name: customer.name })}
              />
            </div>
          );
        }

        if (columnId === "customer") {
          return (
            <button
              key={columnId}
              type="button"
              onClick={onOpen}
              className="flex shrink-0 items-center gap-2.5 overflow-hidden px-2 text-start"
              style={widthStyle}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/15 text-[10px] font-bold text-primary">
                {customerInitials(customer.name)}
              </span>
              <span className="min-w-0 overflow-hidden">
                <span className={cn("flex items-center gap-1.5 font-medium truncate", nameSize)}>
                  <span className="truncate">{customer.name}</span>
                  {row.isVip && (
                    <Badge className="h-5 shrink-0 border-amber-500/30 bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-500/15">
                      VIP
                    </Badge>
                  )}
                </span>
              </span>
            </button>
          );
        }

        if (columnId === "tags") {
          return (
            <div
              key={columnId}
              className={cn("min-w-0 shrink-0 items-center gap-1 overflow-hidden px-2", visibilityClass)}
              style={widthStyle}
            >
              {row.tags.length === 0 ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : (
                row.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="secondary" className="h-5 px-1.5 text-[10px] font-normal capitalize">
                    {tag}
                  </Badge>
                ))
              )}
            </div>
          );
        }

        if (columnId === "company") {
          return (
            <Cell key={columnId} style={widthStyle} className={cn("text-sm font-medium", visibilityClass)}>
              {row.company ?? "—"}
            </Cell>
          );
        }

        if (columnId === "phone") {
          return (
            <Cell key={columnId} style={widthStyle} className={cn("text-sm text-muted-foreground", visibilityClass)}>
              <span dir="ltr">{customer.phone?.trim() ? customer.phone : "—"}</span>
            </Cell>
          );
        }

        if (columnId === "email") {
          return (
            <Cell key={columnId} style={widthStyle} className={cn("text-sm text-muted-foreground", visibilityClass)}>
              {customer.email?.trim() ? customer.email : "—"}
            </Cell>
          );
        }

        if (columnId === "assigned") {
          return (
            <Cell key={columnId} style={widthStyle} className={cn("text-sm text-muted-foreground", visibilityClass)}>
              {row.assignedEmployee ?? t("dashboard.customers.list.unassigned")}
            </Cell>
          );
        }

        if (columnId === "nextAppointment") {
          return (
            <Cell key={columnId} style={widthStyle} className={cn("text-sm tabular-nums", visibilityClass)}>
              {row.nextAppointment ? fmtDate(row.nextAppointment.booking_date) : "—"}
            </Cell>
          );
        }

        if (columnId === "outstanding") {
          return (
            <Cell key={columnId} style={widthStyle} className={cn("text-sm tabular-nums", visibilityClass)}>
              {row.outstanding > 0 ? (
                <span className="font-medium text-orange-600 dark:text-orange-400">{formatMoney(row.outstanding)}</span>
              ) : (
                "—"
              )}
            </Cell>
          );
        }

        if (columnId === "ltv") {
          return (
            <Cell key={columnId} style={widthStyle} className={cn("text-sm tabular-nums font-medium", visibilityClass)}>
              {row.ltv > 0 ? formatMoney(row.ltv) : "—"}
            </Cell>
          );
        }

        if (columnId === "status") {
          return (
            <div
              key={columnId}
              className={cn("min-w-0 shrink-0 items-center overflow-hidden px-2", visibilityClass)}
              style={widthStyle}
            >
              <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[row.status])}>
                {t(`dashboard.customers.list.status.${row.status === "at_risk" ? "atRisk" : row.status}`)}
              </Badge>
            </div>
          );
        }

        if (columnId === "lastActivity") {
          return (
            <Cell key={columnId} style={widthStyle} className={cn("text-xs text-muted-foreground tabular-nums", visibilityClass)}>
              {row.lastActivity ? fmtDate(row.lastActivity) : "—"}
            </Cell>
          );
        }

        if (columnId === "actions") {
          return (
            <div
              key={columnId}
              className="flex shrink-0 items-center justify-center overflow-hidden px-1"
              style={widthStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    aria-label={t("dashboard.customers.list.columns.actions")}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[11rem]">
                  <DropdownMenuItem onClick={() => onQuickAction("profile")}>
                    <UserRound className="me-2 h-3.5 w-3.5" />
                    {t("dashboard.customers.list.openProfile")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onQuickAction("booking")}>
                    <CalendarPlus className="me-2 h-3.5 w-3.5" />
                    {t("dashboard.customerProfile.quickActions.newBooking")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={!customer.phone}
                    onClick={() => onQuickAction("call")}
                  >
                    <Phone className="me-2 h-3.5 w-3.5" />
                    {t("dashboard.customerProfile.quickActions.call")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!customer.phone}
                    onClick={() => onQuickAction("whatsapp")}
                  >
                    <MessageCircle className="me-2 h-3.5 w-3.5" />
                    {t("dashboard.customerProfile.quickActions.whatsapp")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!customer.email}
                    onClick={() => onQuickAction("email")}
                  >
                    <Mail className="me-2 h-3.5 w-3.5" />
                    {t("dashboard.customerProfile.quickActions.email")}
                  </DropdownMenuItem>
                  {(onEdit || onDelete) && <DropdownMenuSeparator />}
                  {onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="me-2 h-3.5 w-3.5" />
                      {t("buttons.edit")}
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                      <Trash2 className="me-2 h-3.5 w-3.5" />
                      {t("buttons.delete")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
});

function Cell({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style: React.CSSProperties;
}) {
  return (
    <div className={cn("flex shrink-0 items-center overflow-hidden truncate px-2", className)} style={style}>
      {children}
    </div>
  );
}
