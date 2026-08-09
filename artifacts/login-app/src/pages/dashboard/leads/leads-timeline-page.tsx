import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { History } from "lucide-react";
import { useLeadsQueue } from "@/hooks/leads/use-leads-workspace";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { Lead360Workspace } from "@/components/leads/lead360/lead360-workspace";
import { LeadsAvatar } from "@/components/leads/workspace/leads-avatar";
import { LeadsStageBadge } from "@/components/leads/workspace/leads-stage-badge";
import { translateLeadStageLabel } from "@/components/leads/kanban/lead-stage-label";
import {
  formatLeadMoney,
  formatRelativeActivity,
} from "@/components/leads/kanban/lead-kanban-mappers";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { cn } from "@/lib/utils";

export function LeadsTimelinePage() {
  const { t, i18n } = useTranslation("common");
  const { data, isLoading } = useLeadsQueue({ limit: 50 });
  const [lead360Id, setLead360Id] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      [...(data?.rows ?? [])].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [data?.rows],
  );

  if (isLoading) return <DashboardPageFallback />;

  return (
    <div className="space-y-6" dir={i18n.dir()}>
      <div>
        <h2 className="text-[1.35rem] font-semibold tracking-tight text-foreground">
          {t("leads.timeline.title")}
        </h2>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
          {t("leads.timeline.subtitle")}
        </p>
      </div>

      {rows.length === 0 ? (
        <EnterpriseEmptyState
          compact
          icon={<History className="size-6" aria-hidden />}
          title={t("leads.timeline.emptyTitle")}
          description={t("leads.timeline.empty")}
        />
      ) : (
        <ol className="relative space-y-0 ps-2">
          <div
            className="absolute inset-y-3 start-[1.15rem] w-px bg-border/70"
            aria-hidden
          />
          {rows.map((row, index) => {
            const displayName = row.contactPerson || row.name;
            const stageLabel = translateLeadStageLabel(t, {
              name: row.stage,
              lifecycleStatus: row.lifecycleStatus,
              slug: row.stage,
            });
            const relative = formatRelativeActivity(t, row.updatedAt, i18n.language);
            return (
              <li key={row.id} className="relative pb-4 last:pb-0">
                <button
                  type="button"
                  onClick={() => setLead360Id(row.id)}
                  className={cn(
                    "group flex w-full gap-4 rounded-2xl border border-border/40 bg-card/50 p-4 text-start shadow-sm transition-colors",
                    "hover:border-border/70 hover:bg-card",
                  )}
                >
                  <div className="relative z-[1] flex shrink-0 flex-col items-center">
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-full border border-border/60 bg-background shadow-sm",
                        index === 0 && "ring-2 ring-foreground/15",
                      )}
                    >
                      <LeadsAvatar name={displayName} size="sm" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-[15px] font-semibold tracking-tight text-foreground group-hover:underline">
                          {displayName}
                        </p>
                        <p className="truncate text-[12px] text-muted-foreground">
                          {[row.companyName, row.owner].filter(Boolean).join(" · ") ||
                            t("leads.timeline.noCompany")}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="text-[12px] font-medium text-foreground">
                          {relative ?? "—"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {new Intl.DateTimeFormat(i18n.language, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(row.updatedAt))}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <LeadsStageBadge
                        label={stageLabel}
                        lifecycleStatus={row.lifecycleStatus}
                      />
                      {row.expectedValue != null ? (
                        <span className="rounded-md bg-muted/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
                          {formatLeadMoney(row.expectedValue)}
                        </span>
                      ) : null}
                      {row.source ? (
                        <span className="text-[11px] text-muted-foreground">
                          {t("leads.timeline.source", { source: row.source })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <Lead360Workspace
        leadId={lead360Id}
        open={Boolean(lead360Id)}
        onClose={() => setLead360Id(null)}
      />
    </div>
  );
}
