import { Ticket, UserMinus, UserPlus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TicketSlaBadge } from "@/components/tickets/ticket-badges";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from "@workspace/ticket-platform";
import type { TicketInboxRow } from "@/lib/tickets/enrich-ticket-rows";
import { noteNestedOverlayActivity } from "@/lib/ui/prevent-dialog-dismiss-for-nested-overlay";
import { cn } from "@/lib/utils";

export function Ticket360Header({
  ticket,
  canAssign,
  canEditStatus,
  canEditPriority,
  statusPending,
  priorityPending,
  onStatusChange,
  onPriorityChange,
  onAssign,
  onUnassign,
  onClose,
}: {
  ticket: TicketInboxRow;
  canAssign: boolean;
  canEditStatus: boolean;
  canEditPriority: boolean;
  statusPending: boolean;
  priorityPending: boolean;
  onStatusChange: (status: TicketStatus) => void;
  onPriorityChange: (priority: TicketPriority) => void;
  onAssign: () => void;
  onUnassign: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("common");

  return (
    <header className="shrink-0 border-b border-border/50 bg-background px-5 py-3 text-start sm:px-7">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
            <Ticket className="size-4 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="space-y-0.5">
              <p dir="ltr" className="font-mono text-[12px] text-muted-foreground">
                {ticket.ticketNumber}
              </p>
              <h2 className="truncate text-[1.15rem] font-semibold tracking-[-0.02em] text-foreground">
                {ticket.subject}
              </h2>
              <p className="truncate text-[13px] text-muted-foreground">
                {ticket.customerName
                  ? [ticket.customerName, ticket.customerPhone].filter(Boolean).join(" · ")
                  : t("tickets.360.noCustomer")}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="min-w-0 space-y-1">
                <span className="block text-[11px] font-medium text-muted-foreground">
                  {t("tickets.columns.status")}
                </span>
                {canEditStatus ? (
                  <Select
                    value={ticket.status}
                    disabled={statusPending}
                    onValueChange={(value) => {
                      noteNestedOverlayActivity();
                      onStatusChange(value as TicketStatus);
                    }}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-9 rounded-lg",
                        statusPending && "opacity-70",
                      )}
                      aria-busy={statusPending}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {t(`tickets.status.${status}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm font-medium">{t(`tickets.status.${ticket.status}`)}</p>
                )}
              </label>

              <label className="min-w-0 space-y-1">
                <span className="block text-[11px] font-medium text-muted-foreground">
                  {t("tickets.columns.priority")}
                </span>
                {canEditPriority ? (
                  <Select
                    value={ticket.priority}
                    disabled={priorityPending}
                    onValueChange={(value) => {
                      noteNestedOverlayActivity();
                      onPriorityChange(value as TicketPriority);
                    }}
                  >
                    <SelectTrigger
                      className={cn("h-9 rounded-lg", priorityPending && "opacity-70")}
                      aria-busy={priorityPending}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_PRIORITIES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {t(`tickets.priority.${item}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm font-medium">{t(`tickets.priority.${ticket.priority}`)}</p>
                )}
              </label>

              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {t("tickets.columns.assignee")}
                </p>
                <p className="truncate text-sm font-medium leading-9">
                  {ticket.assignedUserName || t("tickets.filter.unassigned")}
                </p>
              </div>

              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {t("tickets.columns.sla")}
                </p>
                <div className="flex h-9 items-center">
                  <TicketSlaBadge state={ticket.slaState} label={t(`tickets.sla.${ticket.slaState}`)} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {canAssign ? (
            ticket.assignedUserId ? (
              <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onUnassign}>
                <UserMinus className="size-3.5" aria-hidden />
                {t("tickets.unassign")}
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onAssign}>
                <UserPlus className="size-3.5" aria-hidden />
                {t("tickets.assign")}
              </Button>
            )
          ) : null}
          <Button type="button" size="icon" variant="ghost" className="rounded-xl" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </header>
  );
}
