import { memo, useCallback } from "react";
import {
  Ban,
  CalendarPlus,
  CircleCheck,
  Mail,
  MessageCircle,
  MessageSquareText,
  MoreHorizontal,
  Phone,
  Pencil,
  Trash2,
  UserRound,
  UserX,
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
import { formatCustomerPhoneDisplay } from "@/lib/customers/customer-phone-form";
import {
  lifecycleActionsForStatus,
  normalizeCustomerLifecycleStatus,
} from "@/lib/customers/customer-lifecycle";
import {
  customerListDisplayTags,
  formatMoney,
  type CustomerColumnId,
  type CustomerListChannelCapabilities,
  type CustomerListDensity,
  type EnrichedCustomerRow,
} from "@/lib/customers-list";

export type CustomerListQuickAction =
  | "call"
  | "whatsapp"
  | "email"
  | "sms"
  | "booking"
  | "invoice"
  | "profile"
  | "deactivate"
  | "block"
  | "activate";

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
  canChangeLifecycle?: boolean;
  channelCapabilities: CustomerListChannelCapabilities;
  onQuickAction: (action: CustomerListQuickAction) => void;
};

const STATUS_STYLES = {
  active: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
  inactive: "bg-muted text-muted-foreground border-border",
  blocked: "bg-destructive/15 text-destructive border-destructive/25",
} as const;

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

const TAG_STYLE: Record<string, string> = {
  notes: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  email: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  whatsapp: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  sms: "border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
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
  canChangeLifecycle = false,
  channelCapabilities,
  onQuickAction,
}: CustomersListRowProps) {
  const { t } = useTranslation("common");
  const { customer } = row;
  const hasPhone = Boolean(customer.phone?.trim());
  const hasEmail = Boolean(customer.email?.trim());
  const listTags = customerListDisplayTags(row.tags);
  const lifecycleStatus = normalizeCustomerLifecycleStatus(row.status);
  const lifecycleActions = lifecycleActionsForStatus(lifecycleStatus);

  const cellStyle = useCallback(
    (columnId: CustomerColumnId) => {
      const raw = columnWidths[columnId];
      const width = columnId === "actions" ? Math.max(raw ?? 52, 96) : raw;
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
        "group flex w-max min-w-full items-center border-b border-border/40 transition-colors",
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
                    <Badge className="h-5 shrink-0 border-amber-500/30 bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">
                      {t("dashboard.customerWorkspace.tags.vip")}
                    </Badge>
                  )}
                  {row.tags.includes("notes") && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-5 shrink-0 px-1.5 text-[10px] font-medium",
                        TAG_STYLE.notes,
                      )}
                    >
                      {t("dashboard.customers.list.tags.notes")}
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
              className={cn("flex min-w-0 shrink-0 items-center gap-1 overflow-hidden px-2", visibilityClass)}
              style={widthStyle}
            >
              {listTags.length === 0 ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : (
                listTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className={cn("h-5 px-1.5 text-[10px] font-medium", TAG_STYLE[tag])}
                  >
                    {t(`dashboard.customers.list.tags.${tag}`)}
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
          const phoneDisplay = formatCustomerPhoneDisplay(customer);
          return (
            <Cell key={columnId} style={widthStyle} className={cn("text-sm text-muted-foreground", visibilityClass)}>
              <span dir="ltr">{phoneDisplay.primary || "—"}</span>
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
              className={cn("flex min-w-0 shrink-0 items-center overflow-hidden px-2", visibilityClass)}
              style={widthStyle}
            >
              <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[row.status])}>
                {t(`dashboard.customers.list.status.${row.status}`)}
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
                <DropdownMenuContent align="end" className="min-w-[12rem]">
                  <DropdownMenuItem onClick={() => onQuickAction("profile")}>
                    <UserRound className="me-2 h-3.5 w-3.5" />
                    {t("dashboard.customers.list.openProfile")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onQuickAction("booking")}>
                    <CalendarPlus className="me-2 h-3.5 w-3.5" />
                    {t("dashboard.customerProfile.quickActions.newBooking")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={!hasPhone} onClick={() => onQuickAction("call")}>
                    <Phone className="me-2 h-3.5 w-3.5" />
                    {t("dashboard.customerProfile.quickActions.call")}
                  </DropdownMenuItem>
                  {channelCapabilities.whatsapp ? (
                    <DropdownMenuItem disabled={!hasPhone} onClick={() => onQuickAction("whatsapp")}>
                      <MessageCircle className="me-2 h-3.5 w-3.5" />
                      {t("dashboard.customerProfile.quickActions.whatsapp")}
                    </DropdownMenuItem>
                  ) : null}
                  {channelCapabilities.sms ? (
                    <DropdownMenuItem disabled={!hasPhone} onClick={() => onQuickAction("sms")}>
                      <MessageSquareText className="me-2 h-3.5 w-3.5" />
                      {t("dashboard.customerProfile.quickActions.sms")}
                    </DropdownMenuItem>
                  ) : null}
                  {channelCapabilities.email ? (
                    <DropdownMenuItem disabled={!hasEmail} onClick={() => onQuickAction("email")}>
                      <Mail className="me-2 h-3.5 w-3.5" />
                      {t("dashboard.customerProfile.quickActions.email")}
                    </DropdownMenuItem>
                  ) : null}
                  {(onEdit || onDelete || canChangeLifecycle) && <DropdownMenuSeparator />}
                  {onEdit ? (
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="me-2 h-3.5 w-3.5" />
                      {t("buttons.edit")}
                    </DropdownMenuItem>
                  ) : null}
                  {canChangeLifecycle && lifecycleActions.canDeactivate ? (
                    <DropdownMenuItem onClick={() => onQuickAction("deactivate")}>
                      <UserX className="me-2 h-3.5 w-3.5" />
                      {t("forms.customer.lifecycle.deactivate")}
                    </DropdownMenuItem>
                  ) : null}
                  {canChangeLifecycle && lifecycleActions.canBlock ? (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onQuickAction("block")}
                    >
                      <Ban className="me-2 h-3.5 w-3.5" />
                      {t("forms.customer.lifecycle.block")}
                    </DropdownMenuItem>
                  ) : null}
                  {canChangeLifecycle && lifecycleActions.canActivate ? (
                    <DropdownMenuItem onClick={() => onQuickAction("activate")}>
                      <CircleCheck className="me-2 h-3.5 w-3.5" />
                      {t("forms.customer.lifecycle.activate")}
                    </DropdownMenuItem>
                  ) : null}
                  {onDelete ? (
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                      <Trash2 className="me-2 h-3.5 w-3.5" />
                      {t("buttons.delete")}
                    </DropdownMenuItem>
                  ) : null}
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
