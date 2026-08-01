import type { TimelineEvent } from "@workspace/activity-timeline";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  GitBranch,
  PauseCircle,
  PlayCircle,
  Square,
  StepForward,
  Variable,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { SimulationTimelineEntry } from "../types/simulation-types";

export type SimulationTimelineContext = {
  companyId: string;
  flowId: string;
};

export type SimulationTimelineCardViewModel = {
  id: string;
  title: string;
  description: string | null;
  actor: string | null;
  icon: LucideIcon;
  accentClass: string;
  occurredAt: string;
  relativeTime: string;
  isSimulationPreview: boolean;
};

const EVENT_ICON: Record<SimulationTimelineEntry["type"], LucideIcon> = {
  session_started: PlayCircle,
  session_paused: PauseCircle,
  session_resumed: PlayCircle,
  session_stopped: Square,
  session_restarted: PlayCircle,
  session_completed: StepForward,
  node_entered: StepForward,
  node_exited: StepForward,
  variable_changed: Variable,
  branch_selected: GitBranch,
  decision_taken: GitBranch,
  breakpoint_hit: AlertTriangle,
};

const EVENT_ACCENT: Record<SimulationTimelineEntry["type"], string> = {
  session_started: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  session_paused: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  session_resumed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  session_stopped: "border-border bg-muted/40 text-muted-foreground",
  session_restarted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  session_completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  node_entered: "border-primary/30 bg-primary/10 text-primary",
  node_exited: "border-primary/20 bg-primary/5 text-primary",
  variable_changed: "border-sky-500/30 bg-sky-500/10 text-sky-600",
  branch_selected: "border-violet-500/30 bg-violet-500/10 text-violet-600",
  decision_taken: "border-violet-500/30 bg-violet-500/10 text-violet-600",
  breakpoint_hit: "border-amber-500/30 bg-amber-500/10 text-amber-600",
};

function readTimelineEventType(event: TimelineEvent): SimulationTimelineEntry["type"] {
  const metadataType = event.metadata.eventType;
  if (typeof metadataType === "string" && metadataType in EVENT_ICON) {
    return metadataType as SimulationTimelineEntry["type"];
  }
  if (event.eventType.startsWith("simulation_")) {
    const candidate = event.eventType.slice("simulation_".length);
    if (candidate in EVENT_ICON) {
      return candidate as SimulationTimelineEntry["type"];
    }
  }
  return "node_entered";
}

/** Maps simulation events to Activity Timeline event shape for observability adapters (never persisted). */
export function mapSimulationTimelineToActivityEvents(input: {
  entries: SimulationTimelineEntry[];
  companyId: string;
  flowId: string;
}): TimelineEvent[] {
  return input.entries.map((entry) => ({
    id: entry.id,
    timestamp: entry.timestamp,
    actor: { id: null, label: "Simulation", type: "system" as const },
    eventType: `simulation_${entry.type}`,
    title: entry.label,
    description: entry.detail ?? null,
    metadata: {
      simulation: true,
      productionTelemetryBlocked: true,
      nodeId: entry.nodeId,
      eventType: entry.type,
    },
    sourceModule: "workflows",
    entityType: "workflow_simulation",
    entityId: input.flowId,
    companyId: input.companyId,
  }));
}

export function mapSimulationTimelineToViewModels(
  entries: SimulationTimelineEntry[],
  context?: SimulationTimelineContext,
): SimulationTimelineCardViewModel[] {
  if (context) {
    return mapSimulationTimelineToActivityEvents({
      entries,
      companyId: context.companyId,
      flowId: context.flowId,
    }).map((event) => {
      const eventType = readTimelineEventType(event);
      const nodeId = typeof event.metadata.nodeId === "string" ? event.metadata.nodeId : null;
      return {
        id: event.id,
        title: event.title,
        description: event.description ?? (nodeId ? `Node ${nodeId}` : null),
        actor: event.actor.label,
        icon: EVENT_ICON[eventType] ?? StepForward,
        accentClass: EVENT_ACCENT[eventType] ?? "border-border bg-muted/40 text-muted-foreground",
        occurredAt: new Date(event.timestamp).toLocaleTimeString(),
        relativeTime: formatDistanceToNow(new Date(event.timestamp), { addSuffix: true }),
        isSimulationPreview: event.metadata.simulation === true,
      };
    });
  }

  return entries.map((entry) => ({
    id: entry.id,
    title: entry.label,
    description: entry.detail ?? (entry.nodeId ? `Node ${entry.nodeId}` : null),
    actor: "Simulation",
    icon: EVENT_ICON[entry.type] ?? StepForward,
    accentClass: EVENT_ACCENT[entry.type] ?? "border-border bg-muted/40 text-muted-foreground",
    occurredAt: new Date(entry.timestamp).toLocaleTimeString(),
    relativeTime: formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true }),
    isSimulationPreview: true,
  }));
}
