import { Clock3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import type { AiEmployeeChangeEventRecord } from "@/lib/ai-employees/types";

type ChangeTimelinePanelProps = {
  events: AiEmployeeChangeEventRecord[];
};

export function ChangeTimelinePanel({ events }: ChangeTimelinePanelProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Clock3 className="size-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("aiEmployees.lifecycle.timeline.title")}
        </h2>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("aiEmployees.lifecycle.timeline.empty")}</p>
      ) : (
        <ol className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className="rounded-2xl border border-border/60 bg-background/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {t(`aiEmployees.lifecycle.events.${event.eventType}`, {
                    defaultValue: event.eventType,
                  })}
                </p>
                <span className="text-xs text-muted-foreground">
                  {new Date(event.createdAt).toLocaleString()}
                </span>
              </div>
              {Object.keys(event.metadata).length > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {JSON.stringify(event.metadata)}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </DashboardCard>
  );
}
