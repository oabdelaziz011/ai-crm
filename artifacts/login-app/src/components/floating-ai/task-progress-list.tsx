import { memo } from "react";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAiTasks } from "@/context/ai-task-context";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export const TaskProgressList = memo(function TaskProgressList() {
  const { t } = useTranslation("common");
  const { tasks, dismissTask, activeTaskCount } = useAiTasks();

  const visibleTasks = tasks.filter(
    (task) => task.status === "running" || task.status === "pending" || task.status === "completed" || task.status === "failed",
  ).slice(0, 3);

  if (visibleTasks.length === 0) return null;

  return (
    <div
      className="shrink-0 space-y-2 border-b border-border/60 bg-muted/10 px-3 py-2"
      role="region"
      aria-label={t("floatingAi.tasks.label")}
      aria-live="polite"
    >
      {activeTaskCount > 0 && (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("floatingAi.tasks.inProgress", { count: activeTaskCount })}
        </p>
      )}
      {visibleTasks.map((task) => (
        <div key={task.id} className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/60 p-2">
          {task.status === "running" || task.status === "pending" ? (
            <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
          ) : task.status === "completed" ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
          ) : (
            <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{task.label}</p>
            {task.message && <p className="text-[10px] text-muted-foreground">{task.message}</p>}
            {(task.status === "running" || task.status === "pending") && (
              <Progress value={task.progress} className="mt-1.5 h-1" />
            )}
          </div>
          {(task.status === "completed" || task.status === "failed" || task.status === "cancelled") && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={() => dismissTask(task.id)}
              aria-label={t("floatingAi.tasks.dismiss")}
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
});
