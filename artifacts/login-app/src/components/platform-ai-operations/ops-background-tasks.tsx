import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { PlatformAiOpsBackgroundTask } from "@/lib/platform-ai-operations";

type OpsBackgroundTasksProps = {
  tasks: PlatformAiOpsBackgroundTask[];
  loading?: boolean;
};

export function OpsBackgroundTasks({ tasks, loading }: OpsBackgroundTasksProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="overflow-hidden">
      <div className="border-b border-border/60 px-5 py-4">
        <h3 className="text-sm font-semibold">{t("platformAiOps.tasks.title")}</h3>
      </div>
      {loading ? (
        <DashboardTableSkeleton rows={5} />
      ) : tasks.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("platformAiOps.tasks.empty")}</p>
      ) : (
        <div className="divide-y divide-border/40">
          {tasks.map((task) => (
            <div key={task.id} className="space-y-2 px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{task.label}</p>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {task.status}
                </Badge>
              </div>
              <Progress value={Number(task.progress)} className="h-1.5" />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{format(new Date(task.started_at), "HH:mm:ss")}</span>
                <span>
                  {t("platformAiOps.tasks.retries", { count: task.retry_count })} · {Number(task.progress).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
