import { memo } from "react";
import { CheckCircle2, Circle, ListTodo } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useEntityWorkspace } from "@/context/entity-workspace-context";

export const EntityTasksPanel = memo(function EntityTasksPanel() {
  const { t } = useTranslation("common");
  const { tasks, permissions } = useEntityWorkspace();

  if (!permissions.canReadTasks) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold tracking-tight">{t("entityWorkspace.panels.tasks")}</h3>

      {tasks.length === 0 ? (
        <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-center">
          <ListTodo className="size-6 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">{t("entityWorkspace.tasks.emptyTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("entityWorkspace.tasks.emptyDescription")}</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {tasks.map((task) => {
            const done = Boolean(task.completedAt) || task.status === "completed" || task.status === "done";
            return (
              <li
                key={task.id}
                className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/80 px-3 py-2.5"
              >
                {done ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {[task.status, task.dueAt ? format(new Date(task.dueAt), "MMM d, yyyy") : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
});
