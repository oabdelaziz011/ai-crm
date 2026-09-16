import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TicketDateTime } from "@/components/tickets/ticket-badges";
import { useEmployeeIdentity } from "@/hooks/employee-identity/use-employee-identity";
import { useTicketAuditTrail, type TicketAuditEntry } from "@/hooks/tickets/use-ticket-audit";
import { describeTicketActivityEntry } from "@/lib/tickets/ticket360-tab-models";
import {
  buildTicketAuditPresentationModel,
  formatTicketAuditTimelineDate,
  localizeTicketAuditFieldLabel,
  localizeTicketAuditFieldValue,
  TICKET_AUDIT_FIELD_ORDER,
  type TicketAuditChangedField,
} from "@/lib/tickets/ticket360-audit-presentation";
import { cn } from "@/lib/utils";

function ActorName({ userId }: { userId: string | null }) {
  const { t } = useTranslation("common");
  const { data } = useEmployeeIdentity(userId);
  if (!userId) return <span>{t("tickets.360.systemActor")}</span>;
  return <span>{data?.fullName?.trim() || userId.slice(0, 8)}</span>;
}

function AuditFieldValue({ field, value }: { field: string; value: unknown }) {
  const { t } = useTranslation("common");
  if (field === "assignedUserId") {
    if (value == null || value === "") {
      return <span>{t("tickets.filter.unassigned")}</span>;
    }
    return <ActorName userId={String(value)} />;
  }
  return <span>{localizeTicketAuditFieldValue(field, value, t as never)}</span>;
}

function AuditCreateSummary({ snapshot }: { snapshot: Record<string, unknown> }) {
  const { t } = useTranslation("common");
  const fields = [
    ...TICKET_AUDIT_FIELD_ORDER.filter((field) => snapshot[field] !== undefined),
    ...Object.keys(snapshot).filter(
      (field) => !(TICKET_AUDIT_FIELD_ORDER as readonly string[]).includes(field),
    ),
  ];
  if (fields.length === 0) return null;
  return (
    <dl className="mt-3 space-y-1.5 text-sm">
      {fields.map((field) => (
        <div key={field} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <dt className="text-muted-foreground">{localizeTicketAuditFieldLabel(field, t as never)}</dt>
          <dd className="font-medium text-foreground">
            <AuditFieldValue field={field} value={snapshot[field]} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AuditChangedFields({ changes }: { changes: TicketAuditChangedField[] }) {
  const { t } = useTranslation("common");
  if (changes.length === 0) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">{t("tickets.360.audit.noFieldChanges")}</p>
    );
  }
  return (
    <ul className="mt-3 space-y-2">
      {changes.map((change) => (
        <li
          key={change.field}
          className="grid gap-1 rounded-lg bg-muted/30 px-3 py-2 text-sm sm:grid-cols-[minmax(6rem,9rem)_1fr] sm:items-center"
        >
          <span className="text-muted-foreground">
            {localizeTicketAuditFieldLabel(change.field, t as never)}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
            <AuditFieldValue field={change.field} value={change.before} />
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
            <AuditFieldValue field={change.field} value={change.after} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function AuditTechnicalDetails({ entry }: { entry: TicketAuditEntry }) {
  const { t } = useTranslation("common");
  if (!entry.metadata) return null;
  return (
    <Collapsible className="mt-3">
      <CollapsibleTrigger className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline">
        {t("tickets.360.audit.technicalDetails")}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre
          className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground"
          dir="ltr"
        >
          {JSON.stringify(entry.metadata, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AuditEventCard({ entry }: { entry: TicketAuditEntry }) {
  const { t, i18n } = useTranslation("common");
  const model = buildTicketAuditPresentationModel(entry, t as never);
  const tone =
    model.kind === "create"
      ? "border-emerald-500/25"
      : model.kind === "delete"
        ? "border-destructive/25"
        : model.kind === "comment"
          ? "border-sky-500/25"
          : "border-border/60";

  return (
    <li className={cn("border-s-2 ps-3 pe-1 py-3", tone)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-foreground">{model.title}</p>
          <p className="text-xs text-muted-foreground">
            <span>{model.entityLabel}</span>
            <span className="mx-1.5 text-border">·</span>
            <ActorName userId={entry.userId} />
          </p>
        </div>
        <time
          dateTime={entry.createdAt}
          dir="ltr"
          className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
        >
          {formatTicketAuditTimelineDate(entry.createdAt, i18n.language)}
        </time>
      </div>

      {model.kind === "create" || model.kind === "comment" ? (
        model.createSnapshot ? <AuditCreateSummary snapshot={model.createSnapshot} /> : null
      ) : model.kind === "update" || model.changedFields.length > 0 ? (
        <AuditChangedFields changes={model.changedFields} />
      ) : null}

      {model.hasRawMetadata ? <AuditTechnicalDetails entry={entry} /> : null}
    </li>
  );
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
              <p className="text-sm font-medium">
                {describeTicketActivityEntry(entry, t as never)}
              </p>
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
  const { t } = useTranslation("common");
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
          title={t("tickets.360.auditErrorTitle")}
          description={t("tickets.360.auditErrorBody")}
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
          title={t("tickets.360.auditEmptyTitle")}
          description={t("tickets.360.auditEmptyBody")}
        />
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-6">
      <ol className="divide-y divide-border/50">
        {entries.map((entry) => (
          <AuditEventCard key={entry.id} entry={entry} />
        ))}
      </ol>
    </div>
  );
}
