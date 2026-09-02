import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  History,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Customer } from "@/lib/types";
import { WorkspaceSkeleton } from "@/components/customer-workspace/workspace-ui";
import {
  WorkspaceInlineEmpty,
  WorkspaceTabFrame,
} from "@/components/customer-workspace/workspace-tab-frame";
import { useCustomerAuditHistory } from "@/hooks/customers/use-customer-audit-history";
import {
  type CustomerAuditEventFilter,
  type CustomerAuditFieldChange,
  type CustomerAuditHistoryItem,
  type CustomerAuditHistoryPeriod,
  type CustomerAuditSourceFilter,
} from "@/lib/customer-workspace/customer-audit-history";
import { fmtDateTime } from "@/lib/customer-workspace/customer-workspace-utils";
import { cn } from "@/lib/utils";

type Props = {
  customer: Customer;
  companyId: string | null;
  moduleAccess?: import("@/lib/customer-workspace/workspace-feature-access").CustomerAuditModuleAccess;
  context?: unknown;
};

function fieldLabelKey(field: string): string {
  const map: Record<string, string> = {
    name: "dashboard.customerWorkspace.history.fields.name",
    email: "dashboard.customerWorkspace.history.fields.email",
    phone: "dashboard.customerWorkspace.history.fields.phone",
    phone_e164: "dashboard.customerWorkspace.history.fields.phone",
    status: "dashboard.customerWorkspace.history.fields.status",
    service: "dashboard.customerWorkspace.history.fields.service",
    amount: "dashboard.customerWorkspace.history.fields.amount",
    priority: "dashboard.customerWorkspace.history.fields.priority",
    subject: "dashboard.customerWorkspace.history.fields.subject",
  };
  return map[field] ?? "dashboard.customerWorkspace.history.fields.generic";
}

function ActorLabel({ item }: { item: CustomerAuditHistoryItem }) {
  const { t } = useTranslation("common");
  if (item.actorKind === "user") {
    return <>{item.actorName ?? item.actorEmail ?? t("dashboard.customerWorkspace.history.actor.userUnknown")}</>;
  }
  return <>{t("dashboard.customerWorkspace.history.actor.system")}</>;
}

function ChangesBlock({
  changes,
  locale,
}: {
  changes: CustomerAuditFieldChange[];
  locale: string;
}) {
  const { t } = useTranslation("common");
  if (changes.length === 0) return null;
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs">
      {changes.map((change) => (
        <div key={change.field} className="space-y-0.5">
          <div className="font-medium text-foreground">
            {t(fieldLabelKey(change.field), { defaultValue: change.field })}
          </div>
          <div className="grid gap-1 sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">
                {t("dashboard.customerWorkspace.history.before")}:{" "}
              </span>
              <span dir={locale.startsWith("ar") ? "auto" : undefined}>
                {change.before ?? "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">
                {t("dashboard.customerWorkspace.history.after")}:{" "}
              </span>
              <span dir={locale.startsWith("ar") ? "auto" : undefined}>
                {change.after ?? "—"}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryEventCard({
  item,
  locale,
}: {
  item: CustomerAuditHistoryItem;
  locale: string;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const hasDetails = item.changes.length > 0 || Boolean(item.entityId);

  return (
    <article className="rounded-xl border border-border/60 bg-card/40 px-3 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
          <History className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            {t(item.titleKey)}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <UserRound className="size-3" />
              <ActorLabel item={item} />
            </span>
            <span className="mx-1.5">·</span>
            <span>{fmtDateTime(item.occurredAt, locale)}</span>
            {item.source ? (
              <>
                <span className="mx-1.5">·</span>
                <span>
                  {t(`dashboard.customerWorkspace.history.source.${item.source}`, {
                    defaultValue: item.source,
                  })}
                </span>
              </>
            ) : null}
          </p>

          {open ? (
            <div className="mt-2 space-y-2 text-xs text-muted-foreground">
              <div>
                {t("dashboard.customerWorkspace.history.colAction")}: {item.action}
                {item.entity ? ` · ${item.entity}` : ""}
                {item.entityId ? ` · ${item.entityId.slice(0, 8)}…` : ""}
              </div>
              <ChangesBlock changes={item.changes} locale={locale} />
            </div>
          ) : null}

          {hasDetails ? (
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary"
              onClick={() => setOpen((v) => !v)}
            >
              {open
                ? t("dashboard.customerWorkspace.history.hideDetails")
                : t("dashboard.customerWorkspace.history.showDetails")}
              {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function WorkspaceHistoryTab({ customer, companyId, moduleAccess }: Props) {
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language ?? "en";
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<CustomerAuditHistoryPeriod>("all");
  const [eventFilter, setEventFilter] = useState<CustomerAuditEventFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<CustomerAuditSourceFilter>("all");

  const history = useCustomerAuditHistory({
    companyId,
    customerId: customer.id,
    page,
    period,
    eventFilter,
    sourceFilter,
    moduleAccess,
  });

  const totalPages = Math.max(1, Math.ceil(history.total / history.pageSize));

  const filterBar = useMemo(
    () => (
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          value={period}
          onValueChange={(v) => {
            setPage(1);
            setPeriod(v as CustomerAuditHistoryPeriod);
          }}
        >
          <SelectTrigger className="h-8 w-[9.5rem] rounded-lg text-xs">
            <SelectValue placeholder={t("dashboard.customerWorkspace.history.filters.period")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">{t("dashboard.customerWorkspace.history.period.7d")}</SelectItem>
            <SelectItem value="30d">{t("dashboard.customerWorkspace.history.period.30d")}</SelectItem>
            <SelectItem value="90d">{t("dashboard.customerWorkspace.history.period.90d")}</SelectItem>
            <SelectItem value="all">{t("dashboard.customerWorkspace.history.period.all")}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={eventFilter}
          onValueChange={(v) => {
            setPage(1);
            setEventFilter(v as CustomerAuditEventFilter);
          }}
        >
          <SelectTrigger className="h-8 w-[10.5rem] rounded-lg text-xs">
            <SelectValue placeholder={t("dashboard.customerWorkspace.history.filters.event")} />
          </SelectTrigger>
          <SelectContent>
            {(
              ["all", "customer", "booking", "ticket", "invoice", "campaign", "other"] as const
            ).map((value) => (
              <SelectItem key={value} value={value}>
                {t(`dashboard.customerWorkspace.history.eventFilter.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sourceFilter}
          onValueChange={(v) => {
            setPage(1);
            setSourceFilter(v as CustomerAuditSourceFilter);
          }}
        >
          <SelectTrigger className="h-8 w-[10rem] rounded-lg text-xs">
            <SelectValue placeholder={t("dashboard.customerWorkspace.history.filters.source")} />
          </SelectTrigger>
          <SelectContent>
            {(["all", "crm", "marketing_campaign", "system", "unknown"] as const).map((value) => (
              <SelectItem key={value} value={value}>
                {t(`dashboard.customerWorkspace.history.sourceFilter.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    ),
    [eventFilter, period, sourceFilter, t],
  );

  if (!history.canView) {
    return (
      <WorkspaceTabFrame title={t("dashboard.customerWorkspace.history.title")}>
        <WorkspaceInlineEmpty
          icon={History}
          title={t("dashboard.customerWorkspace.history.noPermission")}
          description={t("dashboard.customerWorkspace.history.emptyDescription")}
        />
      </WorkspaceTabFrame>
    );
  }

  if (history.isLoading && !history.data) {
    return <WorkspaceSkeleton rows={6} />;
  }

  return (
    <WorkspaceTabFrame
      title={t("dashboard.customerWorkspace.history.title")}
      subtitle={t("dashboard.customerWorkspace.history.subtitle")}
    >
      {filterBar}

      {history.error ? (
        <p className="mb-3 text-sm text-destructive">{history.error}</p>
      ) : null}

      {history.items.length === 0 ? (
        <WorkspaceInlineEmpty
          icon={History}
          title={t("dashboard.customerWorkspace.history.emptyTitle")}
          description={t("dashboard.customerWorkspace.history.emptyDescription")}
        />
      ) : (
        <>
          <div className={cn("space-y-2")}>
            {history.items.map((item) => (
              <HistoryEventCard key={item.id} item={item} locale={locale} />
            ))}
          </div>

          {history.total > history.pageSize ? (
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {t("dashboard.customerWorkspace.history.pagination", {
                  page,
                  pages: totalPages,
                  total: history.total,
                })}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </WorkspaceTabFrame>
  );
}
