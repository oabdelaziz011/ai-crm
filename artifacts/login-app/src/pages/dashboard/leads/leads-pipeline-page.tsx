import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLeadKanbanBoard, useLeadPipelines } from "@/hooks/leads/use-leads-workspace";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { WorkspaceMetric } from "@/components/customer-workspace/workspace-ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LeadsPipelinePage() {
  const { t } = useTranslation("common");
  const { data: pipelines } = useLeadPipelines();
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const { data: board, isLoading } = useLeadKanbanBoard(pipelineId);

  useEffect(() => {
    if (!pipelineId && pipelines?.length) {
      const defaultPipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0];
      setPipelineId(defaultPipeline?.id ?? null);
    }
  }, [pipelineId, pipelines]);

  if (isLoading && !board) return <DashboardPageFallback />;

  const totalValue = (board?.stages ?? []).reduce((sum, stage) => sum + (stage.totalValue ?? 0), 0);
  const totalLeads = (board?.stages ?? []).reduce((sum, stage) => sum + (stage.leadCount ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{t("leads.pipeline.title", "Pipeline")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("leads.pipeline.subtitle", "Configurable stages from the pipeline configuration engine.")}
          </p>
        </div>
        <Select value={pipelineId ?? undefined} onValueChange={setPipelineId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={t("leads.pipeline.select", "Pipeline")} />
          </SelectTrigger>
          <SelectContent>
            {(pipelines ?? []).map((pipeline) => (
              <SelectItem key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <WorkspaceMetric label={t("leads.pipeline.totalLeads", "Total leads")} value={totalLeads} compact />
        <WorkspaceMetric label={t("leads.pipeline.pipelineValue", "Pipeline value")} value={totalValue} compact accent="success" />
        <WorkspaceMetric label={t("leads.pipeline.stages", "Stages")} value={board?.stages.length ?? 0} compact />
        <WorkspaceMetric label={t("leads.pipeline.pipeline", "Pipeline")} value={board?.pipeline.name ?? "—"} compact />
      </div>

      <div className="space-y-3">
        {(board?.stages ?? []).map((stage) => (
          <div key={stage.id} className="rounded-xl border border-border/60 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">{stage.name}</div>
                <div className="text-xs text-muted-foreground capitalize">{stage.lifecycleStatus}</div>
              </div>
              <div className="text-right text-sm">
                <div>{stage.leadCount ?? 0} leads</div>
                <div className="text-muted-foreground">{stage.probabilityPercent}% probability</div>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary/70"
                style={{ width: `${Math.min(100, stage.probabilityPercent)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
