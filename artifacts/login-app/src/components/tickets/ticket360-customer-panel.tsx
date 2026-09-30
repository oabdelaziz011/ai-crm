import { UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { Skeleton } from "@/components/ui/skeleton";
import { TicketStatusBadge, TicketPriorityBadge, formatTicketDateTime } from "@/components/tickets/ticket-badges";
import { useTicketCustomerContext } from "@/hooks/tickets/use-ticket-customer-context";
import { resolveAvatarDisplayUrl } from "@/lib/avatar-url";

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
  const avatarSrc = resolveAvatarDisplayUrl(row.avatarUrl);
  const initials = row.name.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar className="size-12 shrink-0">
            {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">{t("tickets.columns.customer")}</p>
            <h3 className="truncate text-base font-semibold">{row.name}</h3>
          </div>
        </div>
        <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenCustomer(row.id)}>
          {t("tickets.360.openCustomer")}
        </Button>
      </div>

      <section className="rounded-xl border border-border/50 bg-muted/10 px-3.5 py-3">
        <h4 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("tickets.360.customerContactGroup")}
        </h4>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">{t("tickets.360.customerEmail")}</p>
            <p className="mt-0.5 truncate text-sm font-medium" dir="auto">
              {row.email || "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">{t("tickets.360.customerPhone")}</p>
            <p className="mt-0.5 text-sm font-medium" dir="ltr">
              {row.phone || "—"}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h4 className="text-sm font-semibold">{t("tickets.360.previousTickets")}</h4>
          {row.previousTickets.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {t("tickets.360.previousTicketsCount", { count: row.previousTickets.length })}
            </p>
          ) : null}
        </div>

        {row.previousTickets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-sm text-muted-foreground">
            {t("tickets.360.noPreviousTickets")}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/60">
            <div className="hidden grid-cols-[minmax(0,1.4fr)_auto_auto_auto] gap-3 border-b border-border/50 bg-muted/20 px-3 py-2 text-[11px] font-medium text-muted-foreground sm:grid">
              <span>{t("tickets.columns.subject")}</span>
              <span>{t("tickets.columns.status")}</span>
              <span>{t("tickets.columns.priority")}</span>
              <span className="text-end">{t("tickets.createdAt")}</span>
            </div>
            <ul className="divide-y divide-border/50">
              {row.previousTickets.map((ticket) => (
                <li key={ticket.id}>
                  <button
                    type="button"
                    className="grid w-full gap-2 px-3 py-2.5 text-start hover:bg-muted/30 sm:grid-cols-[minmax(0,1.4fr)_auto_auto_auto] sm:items-center sm:gap-3"
                    onClick={() => onOpenTicket(ticket.id)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{ticket.subject}</p>
                      <p dir="ltr" className="font-mono text-[11px] text-muted-foreground">
                        {ticket.ticketNumber}
                      </p>
                    </div>
                    <TicketStatusBadge status={ticket.status} label={t(`tickets.status.${ticket.status}`)} />
                    <TicketPriorityBadge
                      priority={ticket.priority}
                      label={t(`tickets.priority.${ticket.priority}`)}
                    />
                    <span className="text-[11px] tabular-nums text-muted-foreground sm:text-end">
                      {formatTicketDateTime(ticket.createdAt, i18n.language)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
