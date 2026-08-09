import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { OpportunityReadModel } from "@workspace/application-layer";
import { Briefcase } from "lucide-react";
import { useOpportunitiesWorkspace } from "@/components/opportunities/layout/opportunities-workspace-context";
import { formatOpportunityMoney } from "@/components/opportunities/opportunity360-ui";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { EnterpriseEmptyState } from "@/components/enterprise";
import {
  resolveOpportunityStageLabel,
  useActiveOpportunityPipelineId,
  useOpportunityPipelineContext,
} from "@/hooks/opportunities/use-opportunity-pipeline";
import { localizeOpportunityStageName } from "@/lib/sales/sales-localize";
import { useAuthUser } from "@/hooks/use-rbac";

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

export function OpportunitiesTablePage() {
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

  const stageLabel = (opp: OpportunityReadModel) =>
    localizeOpportunityStageName(
      t,
      resolveOpportunityStageLabel(pipelineContext.stageById, opp.stageId, opp.stage),
    );

  if (rows.length === 0) {
    return (
      <EnterpriseEmptyState
        icon={<Briefcase className="size-6" aria-hidden />}
        title={t("opportunities.pipeline.emptyTitle")}
        description={t("opportunities.pipeline.emptyBody")}
        primaryAction={
          canCreate
            ? {
                label: t("opportunities.create"),
                onClick: () => setCreateOpen(true),
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-start text-[13px]">
          <thead className="border-b border-border/40 bg-muted/20 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">{t("opportunities.fields.name")}</th>
              <th className="px-4 py-3 font-semibold">{t("opportunities360.fields.company")}</th>
              <th className="px-4 py-3 font-semibold">{t("opportunities360.fields.stage")}</th>
              <th className="px-4 py-3 font-semibold">{t("opportunities360.fields.amount")}</th>
              <th className="px-4 py-3 font-semibold">{t("opportunities360.fields.probability")}</th>
              <th className="px-4 py-3 font-semibold">{t("opportunities360.fields.owner")}</th>
              <th className="px-4 py-3 font-semibold">{t("opportunities360.fields.updatedAt")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((opp) => (
              <tr
                key={opp.id}
                className="cursor-pointer border-b border-border/30 transition hover:bg-muted/20"
                onClick={() => setSelectedId(opp.id)}
              >
                <td className="px-4 py-3 font-medium">{opp.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{opp.companyName ?? "—"}</td>
                <td className="px-4 py-3">{stageLabel(opp)}</td>
                <td className="px-4 py-3 tabular-nums">
                  {formatOpportunityMoney(opp.expectedRevenue, opp.currency)}
                </td>
                <td className="px-4 py-3 tabular-nums">{opp.probabilityPercent}%</td>
                <td className="px-4 py-3">{opp.owner ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {new Intl.DateTimeFormat(i18n.language, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(opp.updatedAt))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
