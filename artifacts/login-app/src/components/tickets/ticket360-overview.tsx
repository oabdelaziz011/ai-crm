import { useTranslation } from "react-i18next";
import type { TicketInboxRow } from "@/lib/tickets/enrich-ticket-rows";
import {
  TicketDateTime,
  TicketPriorityBadge,
  TicketSlaBadge,
  TicketStatusBadge,
} from "@/components/tickets/ticket-badges";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/50 px-3 py-2.5 text-start">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

export function Ticket360Overview({ ticket }: { ticket: TicketInboxRow }) {
  const { t, i18n } = useTranslation("common");

  return (
    <div className="space-y-4 p-5 text-start sm:p-6">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t("tickets.360.overviewTitle")}</h3>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {ticket.description?.trim() || t("tickets.noDescription")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("tickets.columns.number")}>
          <span dir="ltr" className="inline-block font-mono">
            {ticket.ticketNumber}
          </span>
        </Field>
        <Field label={t("tickets.columns.subject")}>{ticket.subject}</Field>
        <Field label={t("tickets.columns.status")}>
          <TicketStatusBadge status={ticket.status} label={t(`tickets.status.${ticket.status}`)} />
        </Field>
        <Field label={t("tickets.columns.priority")}>
          <TicketPriorityBadge priority={ticket.priority} label={t(`tickets.priority.${ticket.priority}`)} />
        </Field>
        <Field label={t("tickets.columns.customer")}>
          {ticket.customerName ? (
            <span className="inline-flex flex-wrap items-center gap-x-1.5">
              <span>{ticket.customerName}</span>
              {ticket.customerPhone ? (
                <span dir="ltr" className="tabular-nums text-muted-foreground">
                  {ticket.customerPhone}
                </span>
              ) : null}
            </span>
          ) : (
            t("tickets.360.noCustomer")
          )}
        </Field>
        <Field label={t("tickets.columns.assignee")}>
          {ticket.assignedUserName || t("tickets.filter.unassigned")}
        </Field>
        <Field label={t("tickets.columns.channel")}>
          {ticket.channelType
            ? t(`tickets.channels.${ticket.channelType}`, { defaultValue: ticket.channelType })
            : t("tickets.360.noChannel")}
        </Field>
        <Field label={t("tickets.columns.sla")}>
          <div className="space-y-1.5">
            <TicketSlaBadge state={ticket.slaState} label={t(`tickets.sla.${ticket.slaState}`)} />
            {ticket.slaDueAt ? (
              <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs font-normal text-muted-foreground">
                <span>{t("tickets.360.slaDue")}</span>
                <TicketDateTime value={ticket.slaDueAt} locale={i18n.language} />
              </p>
            ) : null}
          </div>
        </Field>
        <Field label={t("tickets.createdAt")}>
          <TicketDateTime value={ticket.createdAt} locale={i18n.language} />
        </Field>
        <Field label={t("tickets.columns.updated")}>
          <TicketDateTime value={ticket.updatedAt} locale={i18n.language} />
        </Field>
        <Field label={t("tickets.360.conversationRef")}>
          {ticket.conversationId ? (
            <span dir="ltr" className="inline-block font-mono text-xs">
              {ticket.conversationId.slice(0, 8)}…
            </span>
          ) : (
            t("tickets.360.noConversation")
          )}
        </Field>
        <Field label={t("tickets.columns.lastActivity")}>
          <TicketDateTime value={ticket.lastCustomerActivityAt} locale={i18n.language} />
        </Field>
      </div>
    </div>
  );
}
