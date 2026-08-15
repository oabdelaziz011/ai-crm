import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { PlatformAiOpsAgentWorkflow } from "@/lib/platform-ai-operations";
import { opsStatusLabel } from "./ops-status-label";

type OpsAgentWorkflowsProps = {
  workflows: PlatformAiOpsAgentWorkflow[];
  loading?: boolean;
};

export function OpsAgentWorkflows({ workflows, loading }: OpsAgentWorkflowsProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="overflow-hidden">
      <div className="border-b border-border/60 px-5 py-4">
        <h3 className="text-sm font-semibold">{t("platformAiOps.agentWorkflows.title")}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("platformAiOps.agentWorkflows.subtitle")}</p>
      </div>
      {loading ? (
        <DashboardTableSkeleton rows={5} />
      ) : workflows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("platformAiOps.agentWorkflows.empty")}</p>
      ) : (
        <div className="divide-y divide-border/40">
          {workflows.map((workflow) => (
            <div key={workflow.id} className="space-y-2 px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{workflow.goal}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {workflow.company_name} · {workflow.task_count} {t("platformAiOps.agentWorkflows.tasks")}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {opsStatusLabel(t, workflow.status)}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                {workflow.agent_type === "crm" && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                    {t("platformAiOps.agentWorkflows.crmAgent")}
                  </Badge>
                )}
                {workflow.tools_used?.slice(0, 3).map((tool) => (
                  <Badge key={tool} variant="outline" className="h-4 px-1.5 font-mono text-[9px]">
                    {tool}
                  </Badge>
                ))}
              </div>
              <Progress value={Number(workflow.progress)} className="h-1.5" />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{format(new Date(workflow.updated_at), "MMM d HH:mm")}</span>
                <span className="font-mono">{workflow.correlation_id?.slice(0, 8) ?? "—"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
