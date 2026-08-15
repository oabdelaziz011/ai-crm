import { Plus, Ticket as TicketIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  formatTicketDateTime,
} from "@/components/tickets/ticket-badges";
import { WorkspaceSkeleton } from "@/components/customer-workspace/workspace-ui";
import {
  WorkspaceInlineEmpty,
  WorkspaceStatusChip,
  WorkspaceTabFrame,
} from "@/components/customer-workspace/workspace-tab-frame";
import { useCustomerTickets } from "@/hooks/tickets/use-customer-tickets";
import { useTicketServiceContext } from "@/hooks/tickets/use-ticket-services";
import type { TicketPriority, TicketStatus } from "@workspace/ticket-platform";

type Props = {
  customerId: string;
  onOpenTicket: (ticketId: string) => void;
  onCreateTicket?: () => void;
};

function statusTone(status: TicketStatus): "muted" | "success" | "warning" | "danger" | "primary" {
  if (status === "open" || status === "in_progress") return "primary";
  if (status === "waiting_customer") return "warning";
  if (status === "resolved") return "success";
  return "muted";
}

function priorityTone(priority: TicketPriority): "muted" | "warning" | "danger" {
  if (priority === "urgent") return "danger";
  if (priority === "high") return "warning";
  return "muted";
}

export function WorkspaceTicketsTab({ customerId, onOpenTicket, onCreateTicket }: Props) {
  const { t, i18n } = useTranslation("common");
  const { canView, canCreate } = useTicketServiceContext();
  const tickets = useCustomerTickets(customerId);
  const rows = tickets.data ?? [];

  const summary = useMemo(() => {
    const open = rows.filter((r) => r.status === "open" || r.status === "in_progress").length;
    return { open, total: rows.length };
  }, [rows]);

  if (!canView) {
    return (
      <WorkspaceTabFrame title={t("dashboard.customerWorkspace.tabs.tickets")}>
        <WorkspaceInlineEmpty
          icon={TicketIcon}
          title={t("dashboard.customerWorkspace.tickets.noPermissionTitle")}
          description={t("dashboard.customerWorkspace.tickets.noPermissionBody")}
        />
      </WorkspaceTabFrame>
    );
  }

  if (tickets.isLoading) return <WorkspaceSkeleton rows={5} />;

  return (
    <WorkspaceTabFrame
      title={t("dashboard.customerWorkspace.tabs.tickets")}
      subtitle={
        rows.length
          ? t("dashboard.customerWorkspace.tickets.count", { count: summary.total })
          : t("dashboard.customerWorkspace.tickets.emptyDescription")
      }
      action={
        canCreate && onCreateTicket ? (
          <Button size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={onCreateTicket}>
            <Plus className="size-3.5" />
            {t("tickets.create")}
          </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <WorkspaceInlineEmpty
          icon={TicketIcon}
          title={t("dashboard.customerWorkspace.tickets.emptyTitle")}
          description={t("dashboard.customerWorkspace.tickets.emptyDescription")}
          actionLabel={canCreate && onCreateTicket ? t("tickets.create") : undefined}
          onAction={onCreateTicket}
        />
      ) : (
        <table className="w-full min-w-[40rem] table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-[18%] px-3 py-2.5 text-start">{t("tickets.columns.number")}</th>
              <th className="px-3 py-2.5 text-start">{t("tickets.fields.subject")}</th>
              <th className="w-[16%] px-3 py-2.5 text-start">{t("tickets.columns.status")}</th>
              <th className="w-[14%] px-3 py-2.5 text-start">{t("tickets.columns.priority")}</th>
              <th className="w-[18%] px-3 py-2.5 text-start">{t("tickets.columns.updated")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ticket) => (
              <tr
                key={ticket.id}
                className="cursor-pointer border-b border-border/40 hover:bg-primary/5"
                onClick={() => onOpenTicket(ticket.id)}
              >
                <td className="px-3 py-2.5 text-start text-muted-foreground">
                  <span dir="ltr" className="inline-block font-mono text-xs tabular-nums">
                    {ticket.ticketNumber}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-start font-medium">
                  <span className="line-clamp-1">{ticket.subject}</span>
                </td>
                <td className="px-3 py-2.5 text-start">
                  <WorkspaceStatusChip tone={statusTone(ticket.status)}>
                    {t(`tickets.status.${ticket.status}`)}
                  </WorkspaceStatusChip>
                </td>
                <td className="px-3 py-2.5 text-start">
                  <WorkspaceStatusChip tone={priorityTone(ticket.priority)}>
                    {t(`tickets.priority.${ticket.priority}`)}
                  </WorkspaceStatusChip>
                </td>
                <td className="px-3 py-2.5 text-start text-xs text-muted-foreground tabular-nums">
                  {formatTicketDateTime(ticket.updatedAt, i18n.language)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </WorkspaceTabFrame>
  );
}
