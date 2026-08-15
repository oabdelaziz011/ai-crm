import {
  MoreHorizontal,
  Ticket,
  UserPlus,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TicketPriorityBadge,
  TicketSlaBadge,
  TicketStatusBadge,
} from "@/components/tickets/ticket-badges";
import type { TicketInboxRow } from "@/lib/tickets/enrich-ticket-rows";

export function Ticket360Header({
  ticket,
  canAssign,
  onAssign,
  onUnassign,
  onClose,
}: {
  ticket: TicketInboxRow;
  canAssign: boolean;
  onAssign: () => void;
  onUnassign: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("common");

  return (
    <header className="shrink-0 border-b border-border/50 bg-background px-5 py-4 text-start sm:px-7">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
            <Ticket className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="space-y-1">
              <p dir="ltr" className="font-mono text-[12px] text-muted-foreground">
                {ticket.ticketNumber}
              </p>
              <h2 className="truncate text-[1.25rem] font-semibold tracking-[-0.02em] text-foreground">
                {ticket.subject}
              </h2>
              <p className="truncate text-[13px] text-muted-foreground">
                {[
                  ticket.customerName
                    ? [ticket.customerName, ticket.customerPhone].filter(Boolean).join(" · ")
                    : t("tickets.360.noCustomer"),
                  ticket.assignedUserName
                    ? `${t("tickets.columns.assignee")}: ${ticket.assignedUserName}`
                    : `${t("tickets.columns.assignee")}: ${t("tickets.filter.unassigned")}`,
                ].join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TicketStatusBadge status={ticket.status} label={t(`tickets.status.${ticket.status}`)} />
              <TicketPriorityBadge
                priority={ticket.priority}
                label={t(`tickets.priority.${ticket.priority}`)}
              />
              <TicketSlaBadge state={ticket.slaState} label={t(`tickets.sla.${ticket.slaState}`)} />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {canAssign ? (
            <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onAssign}>
              <UserPlus className="size-3.5" aria-hidden />
              {t("tickets.assign")}
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon" variant="ghost" className="rounded-xl">
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              {canAssign && ticket.assignedUserId ? (
                <DropdownMenuItem onClick={onUnassign}>{t("tickets.unassign")}</DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={onClose}>{t("tickets.360.close")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" size="icon" variant="ghost" className="rounded-xl" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </header>
  );
}
