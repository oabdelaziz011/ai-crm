import { useTranslation } from "react-i18next";
import type { TicketInboxRow } from "@/lib/tickets/enrich-ticket-rows";
import {
  TicketDateTime,
  TicketPriorityBadge,
  TicketSlaBadge,
  TicketStatusBadge,
} from "@/components/tickets/ticket-badges";
import { ticketSlaPresentation } from "@/lib/tickets/ticket360-tab-models";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

export function Ticket360Overview({ ticket }: { ticket: TicketInboxRow }) {
  const { t, i18n } = useTranslation("common");
  const sla = ticketSlaPresentation(ticket.status, ticket.slaDueAt);

  return (
    <div className="space-y-4 p-5 text-start sm:px-6 sm:py-4">
      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold">{t("tickets.360.overviewTitle")}</h3>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {ticket.description?.trim() || t("tickets.noDescription")}
        </p>
      </div>

      <section className="rounded-xl border border-border/50 bg-muted/10 px-3.5 py-3">
        <h4 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("tickets.360.summaryGroup", { defaultValue: t("tickets.360.overviewTitle") })}
        </h4>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("tickets.columns.number")}>
            <span dir="ltr" className="inline-block font-mono text-[13px]">
              {ticket.ticketNumber}
            </span>
          </Field>
          <Field label={t("tickets.columns.subject")} className="sm:col-span-2 lg:col-span-2">
            {ticket.subject}
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
          <Field label={t("tickets.columns.channel")}>
            {ticket.channelType
              ? t(`tickets.channels.${ticket.channelType}`, { defaultValue: ticket.channelType })
              : t("tickets.360.noChannel")}
          </Field>
          <Field label={t("tickets.columns.status")}>
            <TicketStatusBadge status={ticket.status} label={t(`tickets.status.${ticket.status}`)} />
          </Field>
          <Field label={t("tickets.columns.priority")}>
            <TicketPriorityBadge
              priority={ticket.priority}
              label={t(`tickets.priority.${ticket.priority}`)}
            />
          </Field>
          <Field label={t("tickets.columns.assignee")}>
            {ticket.assignedUserName || t("tickets.filter.unassigned")}
          </Field>
          <Field label={t("tickets.columns.sla")}>
            <div className="space-y-1">
              <TicketSlaBadge state={ticket.slaState} label={t(`tickets.sla.${ticket.slaState}`)} />
              {sla.showDueAt ? (
                <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs font-normal text-muted-foreground">
                  <span>
                    {sla.dueIsHistorical ? t("tickets.360.slaDueHistorical") : t("tickets.360.slaDue")}
                  </span>
                  <TicketDateTime value={ticket.slaDueAt} locale={i18n.language} />
                </p>
              ) : null}
            </div>
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-border/50 px-3.5 py-3">
        <h4 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("tickets.360.timelineGroup", { defaultValue: t("tickets.columns.updated") })}
        </h4>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("tickets.createdAt")}>
            <TicketDateTime value={ticket.createdAt} locale={i18n.language} />
          </Field>
          <Field label={t("tickets.columns.updated")}>
            <TicketDateTime value={ticket.updatedAt} locale={i18n.language} />
          </Field>
          <Field label={t("tickets.360.resolvedAt")}>
            <TicketDateTime value={ticket.resolvedAt} locale={i18n.language} />
          </Field>
          <Field label={t("tickets.360.closedAt")}>
            <TicketDateTime value={ticket.closedAt} locale={i18n.language} />
          </Field>
          <Field label={t("tickets.columns.lastActivity")}>
            <TicketDateTime value={ticket.lastCustomerActivityAt} locale={i18n.language} />
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
        </div>
      </section>
    </div>
  );
}
