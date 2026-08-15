import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { Skeleton } from "@/components/ui/skeleton";
import { TicketDateTime } from "@/components/tickets/ticket-badges";
import { useEmployeeIdentity } from "@/hooks/employee-identity/use-employee-identity";
import { useTicketAuditTrail, type TicketAuditEntry } from "@/hooks/tickets/use-ticket-audit";

function ActorName({ userId }: { userId: string | null }) {
  const { data } = useEmployeeIdentity(userId);
  if (!userId) return <span className="text-muted-foreground">—</span>;
  return <span>{data?.fullName?.trim() || userId.slice(0, 8)}</span>;
}

function describeEntry(entry: TicketAuditEntry, t: (key: string, opts?: Record<string, string>) => string) {
  const meta = entry.metadata ?? {};
  if (entry.entity === "support_ticket_comments" && entry.action === "CREATE") {
    return t("tickets.360.activity.commentAdded");
  }
  if (entry.action === "CREATE") return t("tickets.360.activity.created");
  if (entry.action === "DELETE") return t("tickets.360.activity.deleted");

  const oldValues = (meta.old as Record<string, unknown> | undefined) ?? {};
  const newValues = (meta.new as Record<string, unknown> | undefined) ?? {};
  const parts: string[] = [];

  if (oldValues.status !== newValues.status && newValues.status != null) {
    parts.push(
      t("tickets.360.activity.statusChanged", {
        from: String(oldValues.status ?? ""),
        to: String(newValues.status),
      }),
    );
  }
  if (oldValues.priority !== newValues.priority && newValues.priority != null) {
    parts.push(
      t("tickets.360.activity.priorityChanged", {
        from: String(oldValues.priority ?? ""),
        to: String(newValues.priority),
      }),
    );
  }
  if (oldValues.assignedUserId !== newValues.assignedUserId) {
    if (!newValues.assignedUserId) parts.push(t("tickets.360.activity.unassigned"));
    else if (!oldValues.assignedUserId) parts.push(t("tickets.360.activity.assigned"));
    else parts.push(t("tickets.360.activity.reassigned"));
  }

  return parts.length > 0 ? parts.join(" · ") : t("tickets.360.activity.updated");
}

export function Ticket360ActivityPanel({ ticketId }: { ticketId: string }) {
  const { t, i18n } = useTranslation("common");
  const audit = useTicketAuditTrail(ticketId);

  if (audit.isLoading) {
    return (
      <div className="space-y-2 p-5 sm:p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (audit.isError) {
    return (
      <div className="p-5 sm:p-6">
        <EnterpriseEmptyState
          icon={<History className="size-6" aria-hidden />}
          title={t("tickets.360.activityErrorTitle")}
          description={t("tickets.360.activityErrorBody")}
        />
      </div>
    );
  }

  const entries = audit.data ?? [];
  if (entries.length === 0) {
    return (
      <div className="p-5 sm:p-6">
        <EnterpriseEmptyState
          icon={<History className="size-6" aria-hidden />}
          title={t("tickets.360.activityEmptyTitle")}
          description={t("tickets.360.activityEmptyBody")}
        />
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-6">
      <ul className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-xl border border-border/50 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{describeEntry(entry, t as never)}</p>
              <TicketDateTime
                value={entry.createdAt}
                locale={i18n.language}
                className="text-[11px] text-muted-foreground"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <ActorName userId={entry.userId} />
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Ticket360AuditPanel({ ticketId }: { ticketId: string }) {
  const { t, i18n } = useTranslation("common");
  const audit = useTicketAuditTrail(ticketId);

  if (audit.isLoading) {
    return (
      <div className="space-y-2 p-5 sm:p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (audit.isError) {
    return (
      <div className="p-5 sm:p-6">
        <EnterpriseEmptyState
          icon={<History className="size-6" aria-hidden />}
          title={t("tickets.360.activityErrorTitle")}
          description={t("tickets.360.activityErrorBody")}
        />
      </div>
    );
  }

  const entries = audit.data ?? [];
  if (entries.length === 0) {
    return (
      <div className="p-5 sm:p-6">
        <EnterpriseEmptyState
          icon={<History className="size-6" aria-hidden />}
          title={t("tickets.360.activityEmptyTitle")}
          description={t("tickets.360.activityEmptyBody")}
        />
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-6">
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-xl border border-border/50 px-3 py-2.5 font-mono text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-sans text-sm font-medium">
                {entry.action} · {entry.entity}
              </p>
              <TicketDateTime
                value={entry.createdAt}
                locale={i18n.language}
                className="font-sans text-[11px] text-muted-foreground"
              />
            </div>
            <p className="mt-1 font-sans text-xs text-muted-foreground">
              <ActorName userId={entry.userId} />
            </p>
            {entry.metadata ? (
              <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
