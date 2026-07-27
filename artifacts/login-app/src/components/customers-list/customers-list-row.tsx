import { memo, useCallback } from "react";
import {
  CalendarPlus,
  FileText,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
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
  active: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20",
  inactive: "bg-muted text-muted-foreground border-border",
  at_risk: "bg-orange-500/15 text-orange-700 border-orange-500/20",
  new: "bg-blue-500/15 text-blue-700 border-blue-500/20",
} as const;

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
    (columnId: CustomerColumnId) => ({
      width: columnWidths[columnId],
      minWidth: columnWidths[columnId],
      maxWidth: columnWidths[columnId],
    }),
    [columnWidths],
  );

  const nameSize = density === "ultra" ? "text-sm" : density === "compact" ? "text-sm" : "text-[15px]";

  return (
    <div
      role="row"
      className={cn(
        "group relative flex items-center border-b border-border/70 transition-colors duration-150",
        "hover:bg-muted/30 focus-within:bg-muted/20",
        selected && "bg-primary/5 hover:bg-primary/8",
      )}
      style={{ height: rowHeight }}
    >
      {visibleColumns.map((columnId) => {
        if (columnId === "select") {
          return (
            <div
              key={columnId}
              className="flex shrink-0 items-center justify-center px-2"
              style={cellStyle(columnId)}
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
              className="flex min-w-0 flex-1 items-center gap-2.5 px-2 text-start"
              style={cellStyle(columnId)}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/15 text-xs font-bold text-primary">
                {customerInitials(customer.name)}
              </span>
              <span className="min-w-0">
                <span className={cn("flex items-center gap-2 font-semibold truncate", nameSize)}>
                  {customer.name}
                  {row.isVip && (
                    <Badge className="h-5 border-amber-500/30 bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-500/15">
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
            <div key={columnId} className="hidden min-w-0 px-2 lg:flex flex-wrap gap-1" style={cellStyle(columnId)}>
              {row.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="h-5 px-1.5 text-[10px] font-normal capitalize">
                  {tag}
                </Badge>
              ))}
            </div>
          );
        }

        if (columnId === "company") {
          return (
            <Cell key={columnId} columnId={columnId} style={cellStyle(columnId)} className="hidden md:block font-medium text-sm">
              {row.company ?? "—"}
            </Cell>
          );
        }

        if (columnId === "phone") {
          return (
            <Cell key={columnId} columnId={columnId} style={cellStyle(columnId)} className="hidden lg:block text-sm text-muted-foreground">
              <span dir="ltr">{customer.phone ?? "—"}</span>
            </Cell>
          );
        }

        if (columnId === "email") {
          return (
            <Cell key={columnId} columnId={columnId} style={cellStyle(columnId)} className="hidden xl:block text-sm text-muted-foreground/80 truncate">
              {customer.email ?? "—"}
            </Cell>
          );
        }

        if (columnId === "assigned") {
          return (
            <Cell key={columnId} columnId={columnId} style={cellStyle(columnId)} className="hidden xl:block text-sm text-muted-foreground">
              {row.assignedEmployee ?? t("dashboard.customers.list.unassigned")}
            </Cell>
          );
        }

        if (columnId === "nextAppointment") {
          return (
            <Cell key={columnId} columnId={columnId} style={cellStyle(columnId)} className="hidden lg:block text-sm">
              {row.nextAppointment ? fmtDate(row.nextAppointment.booking_date) : "—"}
            </Cell>
          );
        }

        if (columnId === "outstanding") {
          return (
            <Cell key={columnId} columnId={columnId} style={cellStyle(columnId)} className="hidden md:block text-sm tabular-nums">
              {row.outstanding > 0 ? (
                <span className="text-orange-600 font-medium">{formatMoney(row.outstanding)}</span>
              ) : (
                "—"
              )}
            </Cell>
          );
        }

        if (columnId === "ltv") {
          return (
            <Cell key={columnId} columnId={columnId} style={cellStyle(columnId)} className="hidden md:block text-sm tabular-nums font-medium">
              {row.ltv > 0 ? formatMoney(row.ltv) : "—"}
            </Cell>
          );
        }

        if (columnId === "status") {
          return (
            <div key={columnId} className="hidden sm:flex px-2" style={cellStyle(columnId)}>
              <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[row.status])}>
                {t(`dashboard.customers.list.status.${row.status === "at_risk" ? "atRisk" : row.status}`)}
              </Badge>
            </div>
          );
        }

        if (columnId === "lastActivity") {
          return (
            <Cell key={columnId} columnId={columnId} style={cellStyle(columnId)} className="hidden xl:block text-xs text-muted-foreground">
              {row.lastActivity ? fmtDate(row.lastActivity) : "—"}
            </Cell>
          );
        }

        if (columnId === "actions") {
          return (
            <div
              key={columnId}
              className="flex items-center justify-end gap-0.5 px-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
              style={cellStyle(columnId)}
              onClick={(e) => e.stopPropagation()}
            >
              <QuickActionButton
                icon={Phone}
                label={t("dashboard.customerProfile.quickActions.call")}
                onClick={() => onQuickAction("call")}
                disabled={!customer.phone}
              />
              <QuickActionButton
                icon={MessageCircle}
                label="WhatsApp"
                onClick={() => onQuickAction("whatsapp")}
                disabled={!customer.phone}
              />
              <QuickActionButton
                icon={Mail}
                label="Email"
                onClick={() => onQuickAction("email")}
                disabled={!customer.email}
              />
              <QuickActionButton
                icon={CalendarPlus}
                label={t("dashboard.customerProfile.quickActions.newBooking")}
                onClick={() => onQuickAction("booking")}
              />
              <QuickActionButton
                icon={FileText}
                label={t("dashboard.customerProfile.quickActions.newInvoice")}
                onClick={() => onQuickAction("invoice")}
              />
              <QuickActionButton
                icon={UserRound}
                label={t("dashboard.customers.list.openProfile")}
                onClick={() => onQuickAction("profile")}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      {t("buttons.edit")}
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem className="text-destructive" onClick={onDelete}>
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
  columnId,
}: {
  children: React.ReactNode;
  className?: string;
  style: React.CSSProperties;
  columnId: CustomerColumnId;
}) {
  return (
    <div className={cn("min-w-0 truncate px-2", className)} style={style} data-column={columnId}>
      {children}
    </div>
  );
}

function QuickActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Phone;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 hidden 2xl:inline-flex"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
}
