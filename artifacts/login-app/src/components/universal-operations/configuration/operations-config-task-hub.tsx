import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import type { OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";
import {
  OPERATIONS_CONFIG_PRIMARY_TASKS,
  OPERATIONS_CONFIG_SECONDARY_TASKS,
  type OperationsConfigScreen,
  type OperationsConfigTask,
} from "./operations-config-screens";

type Props = {
  draft: OperationsWorkspaceConfig;
  onSelectTask: (screen: OperationsConfigScreen) => void;
};

function taskCount(draft: OperationsWorkspaceConfig, taskId: OperationsConfigScreen): number | null {
  switch (taskId) {
    case "columns":
      return draft.columns.length;
    case "statuses":
      return draft.statuses.length;
    case "services":
      return draft.services?.length ?? 0;
    case "resources":
      return draft.resources?.length ?? 0;
    case "permissions": {
      const p = draft.permissions ?? { columns: {}, statuses: {}, actions: {} };
      return Object.keys(p.columns).length + Object.keys(p.statuses).length + Object.keys(p.actions).length;
    }
    case "payment_status":
      return draft.paymentStatuses?.length ?? 0;
    case "views":
      return draft.views?.savedViews?.length ?? 0;
    default:
      return null;
  }
}

function TaskRow({ task, count, onSelect }: { task: OperationsConfigTask; count: number | null; onSelect: () => void }) {
  const { t } = useTranslation("common");

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 text-start transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t(task.labelKey)}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{t(task.descriptionKey)}</p>
      </div>
      {count !== null ? (
        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
          {t("universalOperations.configuration.tasks.itemCount", { count })}
        </span>
      ) : null}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

export function OperationsConfigTaskHub({ draft, onSelectTask }: Props) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();

  const selectTask = (task: OperationsConfigTask) => {
    if (task.externalHref) {
      setLocation(task.externalHref);
      return;
    }
    onSelectTask(task.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">{t("universalOperations.configuration.tasks.primaryTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("universalOperations.configuration.tasks.primaryHint")}</p>
        <div className="mt-3 space-y-2">
          {OPERATIONS_CONFIG_PRIMARY_TASKS.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              count={task.externalHref ? null : taskCount(draft, task.id)}
              onSelect={() => selectTask(task)}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold">{t("universalOperations.configuration.tasks.moreTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("universalOperations.configuration.tasks.moreHint")}</p>
        <div className="mt-3 space-y-2">
          {OPERATIONS_CONFIG_SECONDARY_TASKS.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              count={taskCount(draft, task.id)}
              onSelect={() => onSelectTask(task.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
