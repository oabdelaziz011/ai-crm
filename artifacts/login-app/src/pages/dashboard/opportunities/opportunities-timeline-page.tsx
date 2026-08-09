import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { OpportunityReadModel } from "@workspace/application-layer";
import { History } from "lucide-react";
import { useOpportunitiesWorkspace } from "@/components/opportunities/layout/opportunities-workspace-context";
import {
  formatOpportunityDateTime,
  formatOpportunityMoney,
} from "@/components/opportunities/opportunity360-ui";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { EnterpriseEmptyState } from "@/components/enterprise";
import {
  resolveOpportunityStageLabel,
  useActiveOpportunityPipelineId,
  useOpportunityPipelineContext,
} from "@/hooks/opportunities/use-opportunity-pipeline";
import { localizeOpportunityStageName } from "@/lib/sales/sales-localize";
import { useAuthUser } from "@/hooks/use-rbac";
import { cn } from "@/lib/utils";

function flattenBoardOpportunities(
  stages: ReadonlyArray<{ opportunities: readonly OpportunityReadModel[] }> | undefined,
): OpportunityReadModel[] {
  if (!stages?.length) return [];
  const byId = new Map<string, OpportunityReadModel>();
  for (const stage of stages) {
    for (const opp of stage.opportunities) {
      byId.set(opp.id, opp);
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function OpportunitiesTimelinePage() {
  const { t, i18n } = useTranslation("common");
  const { setSelectedId, setCreateOpen } = useOpportunitiesWorkspace();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canCreate = isSuperAdmin || hasPermission("opportunities.create");
  const { pipelineId, isLoading: pipelinesLoading } = useActiveOpportunityPipelineId();
  const pipelineContext = useOpportunityPipelineContext(pipelineId);
  const rows = useMemo(
    () => flattenBoardOpportunities(pipelineContext.board?.stages),
    [pipelineContext.board?.stages],
  );

  if (pipelinesLoading || pipelineContext.isLoading) return <DashboardPageFallback />;

  return (
    <div className="space-y-5" dir={i18n.dir()}>
      <div>
        <h2 className="text-[1.2rem] font-semibold tracking-tight">
          {t("opportunities.nav.timeline")}
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t("opportunities.timeline.subtitle", {
            defaultValue: t("opportunities.timeline.emptyBody"),
          })}
        </p>
      </div>

      {rows.length === 0 ? (
        <EnterpriseEmptyState
          icon={<History className="size-6" aria-hidden />}
          title={t("opportunities.timeline.emptyTitle")}
          description={t("opportunities.timeline.emptyBody")}
          primaryAction={
            canCreate
              ? {
                  label: t("opportunities.create"),
                  onClick: () => setCreateOpen(true),
                }
              : undefined
          }
        />
      ) : (
        <ol className="relative space-y-0">
          <div className="absolute inset-y-2 start-4 w-px bg-border/70" aria-hidden />
          {rows.map((opp, index) => (
            <li key={opp.id} className="relative pb-3 last:pb-0">
              <button
                type="button"
                onClick={() => setSelectedId(opp.id)}
                className={cn(
                  "group flex w-full gap-4 rounded-2xl border border-border/40 bg-card/50 p-4 text-start shadow-sm transition-colors",
                  "hover:border-border/70 hover:bg-card",
                )}
              >
                <span
                  className={cn(
                    "relative z-[1] mt-1 flex size-3 shrink-0 rounded-full border-2 border-background bg-foreground/70",
                    index === 0 && "ring-2 ring-foreground/15",
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold tracking-tight group-hover:underline">
                        {opp.name}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                        {[opp.companyName, opp.owner].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                      {formatOpportunityDateTime(opp.updatedAt, i18n.language)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-muted/70 px-2 py-0.5 text-[11px] font-medium">
                      {localizeOpportunityStageName(
                        t,
                        resolveOpportunityStageLabel(
                          pipelineContext.stageById,
                          opp.stageId,
                          opp.stage,
                        ),
                      )}
                    </span>
                    <span className="text-[12px] tabular-nums text-muted-foreground">
                      {formatOpportunityMoney(opp.expectedRevenue, opp.currency)}
                    </span>
                    <span className="text-[12px] tabular-nums text-muted-foreground">
                      {opp.probabilityPercent}%
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
