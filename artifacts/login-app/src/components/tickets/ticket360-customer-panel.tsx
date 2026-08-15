import { UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { Skeleton } from "@/components/ui/skeleton";
import { TicketStatusBadge, TicketPriorityBadge, formatTicketDateTime } from "@/components/tickets/ticket-badges";
import { useTicketCustomerContext } from "@/hooks/tickets/use-ticket-customer-context";

export function Ticket360CustomerPanel({
  customerId,
  onOpenCustomer,
  onOpenTicket,
}: {
  customerId: string | null;
  onOpenCustomer: (customerId: string) => void;
  onOpenTicket: (ticketId: string) => void;
}) {
  const { t, i18n } = useTranslation("common");
  const customer = useTicketCustomerContext(customerId);

  if (!customerId) {
    return (
      <div className="p-5 sm:p-6">
        <EnterpriseEmptyState
          icon={<UserRound className="size-6" aria-hidden />}
          title={t("tickets.360.noCustomerTitle")}
          description={t("tickets.360.noCustomerBody")}
        />
      </div>
    );
  }

  if (customer.isLoading) {
    return (
      <div className="space-y-3 p-5 sm:p-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (customer.isError || !customer.data) {
    return (
      <div className="p-5 sm:p-6">
        <EnterpriseEmptyState
          icon={<UserRound className="size-6" aria-hidden />}
          title={t("tickets.360.customerLoadError")}
          description={t("tickets.360.customerLoadErrorBody")}
        />
      </div>
    );
  }

  const row = customer.data;

  return (
    <div className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{row.name}</h3>
          <p className="text-sm text-muted-foreground">{row.email || "—"}</p>
          <p className="text-sm text-muted-foreground">{row.phone || "—"}</p>
        </div>
        <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenCustomer(row.id)}>
          {t("tickets.360.openCustomer")}
        </Button>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">{t("tickets.360.previousTickets")}</h4>
        {row.previousTickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("tickets.360.noPreviousTickets")}</p>
        ) : (
          <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60">
            {row.previousTickets.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start hover:bg-muted/30"
                  onClick={() => onOpenTicket(ticket.id)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{ticket.subject}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{ticket.ticketNumber}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <TicketStatusBadge status={ticket.status} label={t(`tickets.status.${ticket.status}`)} />
                    <TicketPriorityBadge
                      priority={ticket.priority}
                      label={t(`tickets.priority.${ticket.priority}`)}
                    />
                    <span className="text-[11px] text-muted-foreground">
                      {formatTicketDateTime(ticket.createdAt, i18n.language)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
