import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { AgentWorkflowEventRecord } from "@workspace/agent-runtime";

type AgentEventTimelineProps = {
  events: AgentWorkflowEventRecord[];
  className?: string;
};

const EVENT_COLORS: Record<string, string> = {
  PlanningStarted: "text-blue-500",
  PlanningCompleted: "text-blue-600",
  TaskStarted: "text-primary",
  TaskCompleted: "text-emerald-500",
  TaskFailed: "text-destructive",
  VerificationPassed: "text-emerald-600",
  VerificationFailed: "text-amber-600",
  WorkflowCompleted: "text-emerald-700 font-medium",
  WorkflowPaused: "text-amber-500",
  CheckpointSaved: "text-muted-foreground",
};

export function AgentEventTimeline({ events, className }: AgentEventTimelineProps) {
  const { t } = useTranslation("common");

  if (events.length === 0) {
    return (
      <p className={cn("px-3 py-4 text-center text-xs text-muted-foreground", className)}>
        {t("floatingAi.agent.noEvents")}
      </p>
    );
  }

  return (
    <div className={cn("space-y-1 overflow-y-auto px-3 py-2", className)}>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("floatingAi.agent.timeline")}
      </p>
      {[...events].reverse().map((event) => (
        <div
          key={event.id}
          className="flex items-start gap-2 rounded-md px-2 py-1.5 text-[10px] hover:bg-muted/40"
        >
          <time className="shrink-0 font-mono text-muted-foreground" dateTime={event.created_at}>
            {format(new Date(event.created_at), "HH:mm:ss")}
          </time>
          <span className={cn("min-w-0 flex-1", EVENT_COLORS[event.event_type] ?? "text-foreground")}>
            {event.event_type}
            {event.task_id && (
              <span className="ms-1 text-muted-foreground">· {event.task_id.slice(0, 8)}</span>
            )}
            {typeof event.payload?.message === "string" && (
              <span className="block text-muted-foreground">{event.payload.message}</span>
            )}
            {typeof event.payload?.error === "string" && (
              <span className="block text-destructive">{event.payload.error}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
