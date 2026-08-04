import { CalendarDays, Columns3, GanttChart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUniversalOperationsConfig } from "@/hooks/universal-operations";
import { useWorkspacePlatformOptional } from "@/context/workspace-platform-context";
import { WorkspacePanel } from "@/components/customer-workspace/workspace-ui";

function ConfigDrivenView({
  title,
  description,
  items,
  icon: Icon,
}: {
  title: string;
  description: string;
  items: Array<{ id: string; label: string; meta?: string }>;
  icon: typeof CalendarDays;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <WorkspacePanel title={title}>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-lg border border-border/50 px-3 py-2">
                <p className="text-sm font-medium">{item.label}</p>
                {item.meta && <p className="text-[10px] text-muted-foreground">{item.meta}</p>}
              </div>
            ))}
          </div>
        )}
      </WorkspacePanel>
    </div>
  );
}

export function OperationsCalendarPage() {
  const { t } = useTranslation("common");
  const platform = useWorkspacePlatformOptional();
  const templateKey = platform?.templateKey ?? "clinic";
  const { data: config } = useUniversalOperationsConfig(templateKey);
  const calendar = config?.calendar;

  return (
    <ConfigDrivenView
      icon={CalendarDays}
      title={t("universalOperations.calendar.title")}
      description={t("universalOperations.calendar.description")}
      items={[
        {
          id: "view",
          label: t("universalOperations.calendar.defaultView", { view: calendar?.defaultView ?? "week" }),
        },
        {
          id: "slot",
          label: t("universalOperations.calendar.slotMinutes", { minutes: calendar?.slotMinutes ?? 30 }),
        },
        {
          id: "weekends",
          label: calendar?.showWeekends
            ? t("universalOperations.calendar.weekendsOn")
            : t("universalOperations.calendar.weekendsOff"),
        },
      ]}
    />
  );
}

export function OperationsKanbanPage() {
  const { t } = useTranslation("common");
  const platform = useWorkspacePlatformOptional();
  const templateKey = platform?.templateKey ?? "clinic";
  const { data: config } = useUniversalOperationsConfig(templateKey);
  const kanban = config?.kanban;

  const items =
    kanban?.columns?.map((col) => {
      const status = config?.statuses.find((s) => s.id === col.statusId);
      return {
        id: col.id,
        label: col.label || status?.displayName || col.statusId,
        meta: col.wipLimit ? t("universalOperations.kanban.wipLimit", { limit: col.wipLimit }) : undefined,
      };
    }) ?? [];

  return (
    <ConfigDrivenView
      icon={Columns3}
      title={t("universalOperations.kanban.title")}
      description={t("universalOperations.kanban.description", { groupBy: kanban?.groupBy ?? "status" })}
      items={items}
    />
  );
}

export function OperationsTimelinePage() {
  const { t } = useTranslation("common");
  const platform = useWorkspacePlatformOptional();
  const templateKey = platform?.templateKey ?? "clinic";
  const { data: config } = useUniversalOperationsConfig(templateKey);
  const timeline = config?.timeline;

  return (
    <ConfigDrivenView
      icon={GanttChart}
      title={t("universalOperations.timeline.title")}
      description={t("universalOperations.timeline.description")}
      items={[
        {
          id: "group",
          label: t("universalOperations.timeline.groupBy", { groupBy: timeline?.groupBy ?? "date" }),
        },
        {
          id: "ai",
          label: timeline?.showAiEvents
            ? t("universalOperations.timeline.aiEventsOn")
            : t("universalOperations.timeline.aiEventsOff"),
        },
      ]}
    />
  );
}
