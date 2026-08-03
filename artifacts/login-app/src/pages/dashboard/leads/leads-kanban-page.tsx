import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLeadKanbanBoard, useLeadPipelines } from "@/hooks/leads/use-leads-workspace";
import { useLeadCommands } from "@/hooks/leads/use-lead-commands";
import { Lead360Workspace } from "@/components/leads/lead360/lead360-workspace";
import { mapLeadReadModelToWorkspaceRow } from "@/lib/application-layer/lead-workspace-row-mapper";
import type { LeadWorkspaceRow } from "@workspace/universal-operations-engine";
import { Badge } from "@/components/ui/badge";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LeadsKanbanPage() {
  const { t } = useTranslation("common");
  const { data: pipelines } = useLeadPipelines();
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadWorkspaceRow | null>(null);
  const { data: board, isLoading } = useLeadKanbanBoard(pipelineId);
  const commands = useLeadCommands();

  useEffect(() => {
    if (!pipelineId && pipelines?.length) {
      const defaultPipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0];
      setPipelineId(defaultPipeline?.id ?? null);
    }
  }, [pipelineId, pipelines]);

  const columns = useMemo(() => {
    if (!board) return [];
    return board.stages.map((stage) => ({
      stage,
      leads: (board.leadsByStage[stage.id] ?? []).map((lead) =>
        mapLeadReadModelToWorkspaceRow(lead, stage.name),
      ),
    }));
  }, [board]);

  if (isLoading && !board) return <DashboardPageFallback />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{t("leads.kanban.title", "Kanban")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("leads.kanban.subtitle", "Drag leads across pipeline stages with realtime updates.")}
          </p>
        </div>
        <Select value={pipelineId ?? undefined} onValueChange={setPipelineId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={t("leads.kanban.pipeline", "Pipeline")} />
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

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map(({ stage, leads }) => (
          <div key={stage.id} className="min-w-[280px] flex-1 rounded-xl border border-border/60 bg-muted/10">
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
              <div>
                <div className="font-medium">{stage.name}</div>
                <div className="text-xs text-muted-foreground capitalize">{stage.lifecycleStatus}</div>
              </div>
              <Badge variant="secondary">{leads.length}</Badge>
            </div>
            <div className="space-y-2 p-3">
              {leads.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  className="w-full rounded-lg border border-border/50 bg-background p-3 text-left shadow-sm transition hover:border-primary/30"
                  onClick={() => setSelectedLead(lead)}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("leadId", lead.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const leadId = e.dataTransfer.getData("leadId");
                    if (leadId && stage.id) {
                      commands.changeStage.mutate({ leadId, stageId: stage.id });
                    }
                  }}
                >
                  <div className="font-medium">{lead.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{lead.companyName ?? lead.contactName}</div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span>{lead.score} pts</span>
                    <Badge variant={lead.scoreBand === "hot" ? "destructive" : "secondary"}>{lead.scoreBand}</Badge>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Lead360Workspace leadId={selectedLead?.id ?? null} open={Boolean(selectedLead)} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
