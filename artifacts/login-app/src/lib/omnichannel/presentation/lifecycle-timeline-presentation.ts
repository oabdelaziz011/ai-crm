import {
  format,
  isSameDay,
  isThisWeek,
  isYesterday,
  startOfDay,
} from "date-fns";
import type { TimelineEvent, TimelineEventType } from "@/lib/conversation-lifecycle/types/lifecycle-types";
import { formatSmartTime, type SmartTimeLabels } from "@/lib/omnichannel/presentation/smart-time";
import {
  resolveDisplayName,
  resolveTargetDisplayName,
} from "@/lib/omnichannel/presentation/resolve-display-name";
import type { Profile } from "@/lib/types";

export type LifecycleTimelineFilterId =
  | "all"
  | "assignments"
  | "escalations"
  | "internal_notes"
  | "ai"
  | "status_changes";

const ASSIGNMENT_TYPES = new Set<TimelineEventType>(["assignment", "human_takeover"]);
const AI_TYPES = new Set<TimelineEventType>(["ai_takeover"]);
const ESCALATION_TYPES = new Set<TimelineEventType>(["escalation"]);
const INTERNAL_NOTE_TYPES = new Set<TimelineEventType>(["internal_note"]);
const STATUS_TYPES = new Set<TimelineEventType>([
  "status_change",
  "close",
  "reopen",
  "ownership_change",
  "tag_change",
  "sla_breach",
]);

export type LifecycleTimelineCardModel = {
  id: string;
  event: TimelineEvent;
  timeLabel: string;
  relativeTime: string;
  exactTime: string;
  actorName: string;
  actorInitials: string;
  action: string;
  target: string | null;
  badgeLabel: string;
  badgeTone: "default" | "accent" | "warn" | "danger" | "violet";
  searchableText: string;
  assigneeUserId: string | null;
  assigneeAiEmployeeId: string | null;
  opensCustomer360: boolean;
};

export type LifecycleTimelineGroup = {
  dateKey: string;
  label: string;
  cards: LifecycleTimelineCardModel[];
};

export type LifecycleTimelineDateLabels = {
  today: string;
  yesterday: string;
  lastWeek: string;
};

export type LifecycleTimelineActionLabels = {
  assigned: string;
  assignedToTeam: string;
  assignedToQueue: string;
  assignedToAi: string;
  tookOver: string;
  returnedToAi: string;
  escalated: string;
  returnedFromEscalation: string;
  cancelledEscalation: string;
  resolved: string;
  closed: string;
  reopened: string;
  internalNoteAdded: string;
  internalNoteEdited: string;
  internalNoteDeleted: string;
  customerLinked: string;
  statusChanged: string;
  message: string;
  filterAssignments: string;
  filterEscalations: string;
  filterInternalNotes: string;
  filterAi: string;
  filterStatusChanges: string;
  filterAll: string;
  badgeAssignment: string;
  badgeEscalation: string;
  badgeInternalNote: string;
  badgeAi: string;
  badgeStatus: string;
  badgeCustomer: string;
  badgeMessage: string;
  badgeUpdate: string;
};

type BuildContext = {
  agentsById?: ReadonlyMap<string, { id: string; name: string }>;
  profilesByUserId?: ReadonlyMap<string, Profile>;
  smartTimeLabels: SmartTimeLabels;
  actionLabels: LifecycleTimelineActionLabels;
  supportAgentFallback?: string;
  now?: Date;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveActorName(event: TimelineEvent, context: BuildContext): string {
  return resolveDisplayName({
    userId: event.actorId,
    rawLabel: event.actorLabel,
    agentsById: context.agentsById,
    profilesByUserId: context.profilesByUserId,
    fallback: context.supportAgentFallback ?? "Agent",
  }).display;
}

function buildActionAndTarget(
  event: TimelineEvent,
  context: BuildContext,
): {
  action: string;
  target: string | null;
  assigneeUserId: string | null;
  assigneeAiEmployeeId: string | null;
  opensCustomer360: boolean;
} {
  const payload = event.payload ?? {};
  const targetType = readPayloadString(payload, "targetType");
  const targetId = readPayloadString(payload, "targetId");
  const targetLabel = readPayloadString(payload, "targetLabel");
  const noteAction = readPayloadString(payload, "action");
  const customerId = readPayloadString(payload, "customerId");

  const resolvedTarget = resolveTargetDisplayName(targetType ?? undefined, targetId ?? undefined, targetLabel ?? undefined, {
    agentsById: context.agentsById,
    profilesByUserId: context.profilesByUserId,
    fallback: targetLabel ?? undefined,
  });

  switch (event.type) {
    case "assignment":
    case "human_takeover": {
      if (event.type === "human_takeover") {
        return {
          action: context.actionLabels.tookOver,
          target: null,
          assigneeUserId: event.actorId,
          assigneeAiEmployeeId: null,
          opensCustomer360: false,
        };
      }
      const action =
        targetType === "team"
          ? context.actionLabels.assignedToTeam
          : targetType === "queue"
            ? context.actionLabels.assignedToQueue
            : targetType === "ai_employee"
              ? context.actionLabels.assignedToAi
              : context.actionLabels.assigned;
      return {
        action,
        target: resolvedTarget,
        assigneeUserId: targetType === "user" ? targetId : null,
        assigneeAiEmployeeId: targetType === "ai_employee" ? targetId : null,
        opensCustomer360: false,
      };
    }
    case "escalation":
      return {
        action: context.actionLabels.escalated,
        target: readPayloadString(payload, "targetLevel") ?? resolvedTarget,
        assigneeUserId: null,
        assigneeAiEmployeeId: null,
        opensCustomer360: false,
      };
    case "internal_note":
      return {
        action:
          noteAction === "deleted"
            ? context.actionLabels.internalNoteDeleted
            : noteAction === "edited"
              ? context.actionLabels.internalNoteEdited
              : context.actionLabels.internalNoteAdded,
        target: null,
        assigneeUserId: null,
        assigneeAiEmployeeId: null,
        opensCustomer360: false,
      };
    case "ai_takeover":
      return {
        action: context.actionLabels.returnedToAi,
        target: null,
        assigneeUserId: null,
        assigneeAiEmployeeId: null,
        opensCustomer360: false,
      };
    case "close": {
      const closeAction = event.summary.toLowerCase().includes("resolved")
        ? context.actionLabels.resolved
        : context.actionLabels.closed;
      return {
        action: closeAction,
        target: null,
        assigneeUserId: null,
        assigneeAiEmployeeId: null,
        opensCustomer360: false,
      };
    }
    case "reopen":
      return {
        action: context.actionLabels.reopened,
        target: null,
        assigneeUserId: null,
        assigneeAiEmployeeId: null,
        opensCustomer360: false,
      };
    case "ownership_change":
      return {
        action: context.actionLabels.customerLinked,
        target: resolvedTarget !== "—" ? resolvedTarget : readPayloadString(payload, "customerId"),
        assigneeUserId: null,
        assigneeAiEmployeeId: null,
        opensCustomer360: true,
      };
    case "message":
      return {
        action: context.actionLabels.message,
        target: event.summary.slice(0, 80),
        assigneeUserId: null,
        assigneeAiEmployeeId: null,
        opensCustomer360: Boolean(customerId),
      };
    case "status_change":
      if (event.summary.toLowerCase().includes("returned")) {
        return {
          action: context.actionLabels.returnedFromEscalation,
          target: null,
          assigneeUserId: null,
          assigneeAiEmployeeId: null,
          opensCustomer360: false,
        };
      }
      if (event.summary.toLowerCase().includes("cancelled")) {
        return {
          action: context.actionLabels.cancelledEscalation,
          target: null,
          assigneeUserId: null,
          assigneeAiEmployeeId: null,
          opensCustomer360: false,
        };
      }
      return {
        action: context.actionLabels.statusChanged,
        target: null,
        assigneeUserId: null,
        assigneeAiEmployeeId: null,
        opensCustomer360: false,
      };
    default:
      return {
        action: context.actionLabels.statusChanged,
        target: null,
        assigneeUserId: null,
        assigneeAiEmployeeId: null,
        opensCustomer360: false,
      };
  }
}

function badgeForType(
  type: TimelineEventType,
  labels: LifecycleTimelineActionLabels,
): { label: string; tone: LifecycleTimelineCardModel["badgeTone"] } {
  if (ASSIGNMENT_TYPES.has(type)) return { label: labels.badgeAssignment, tone: "accent" };
  if (ESCALATION_TYPES.has(type)) return { label: labels.badgeEscalation, tone: "warn" };
  if (INTERNAL_NOTE_TYPES.has(type)) return { label: labels.badgeInternalNote, tone: "violet" };
  if (AI_TYPES.has(type)) return { label: labels.badgeAi, tone: "violet" };
  if (type === "close" || type === "reopen") return { label: labels.badgeStatus, tone: "default" };
  if (type === "ownership_change") return { label: labels.badgeCustomer, tone: "accent" };
  if (type === "message") return { label: labels.badgeMessage, tone: "default" };
  return { label: labels.badgeUpdate, tone: "default" };
}

export function buildLifecycleTimelineCard(
  event: TimelineEvent,
  context: BuildContext,
): LifecycleTimelineCardModel {
  const now = context.now ?? new Date();
  const smart = formatSmartTime(event.timestamp, context.smartTimeLabels, now);
  const actorName = resolveActorName(event, context);
  const { action, target, assigneeUserId, assigneeAiEmployeeId, opensCustomer360 } = buildActionAndTarget(
    event,
    context,
  );
  const badge = badgeForType(event.type, context.actionLabels);
  const searchableText = [actorName, action, target, event.summary, event.type].filter(Boolean).join(" ").toLowerCase();

  return {
    id: event.id,
    event,
    timeLabel: format(new Date(event.timestamp), "p"),
    relativeTime: smart.display,
    exactTime: smart.exact,
    actorName,
    actorInitials: initials(actorName),
    action,
    target,
    badgeLabel: badge.label,
    badgeTone: badge.tone,
    searchableText,
    assigneeUserId,
    assigneeAiEmployeeId,
    opensCustomer360,
  };
}

export function filterLifecycleTimelineEvents(
  events: TimelineEvent[],
  filter: LifecycleTimelineFilterId,
): TimelineEvent[] {
  if (filter === "all") return events;
  if (filter === "assignments") return events.filter((event) => ASSIGNMENT_TYPES.has(event.type));
  if (filter === "escalations") return events.filter((event) => ESCALATION_TYPES.has(event.type));
  if (filter === "internal_notes") return events.filter((event) => INTERNAL_NOTE_TYPES.has(event.type));
  if (filter === "ai") return events.filter((event) => AI_TYPES.has(event.type));
  if (filter === "status_changes") {
    return events.filter((event) => STATUS_TYPES.has(event.type) || event.type === "close" || event.type === "reopen");
  }
  return events;
}

export function searchLifecycleTimelineCards(
  cards: LifecycleTimelineCardModel[],
  query: string,
): LifecycleTimelineCardModel[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return cards;
  return cards.filter((card) => card.searchableText.includes(normalized));
}

export function groupLifecycleTimelineCards(
  cards: LifecycleTimelineCardModel[],
  dateLabels: LifecycleTimelineDateLabels,
  now: Date = new Date(),
): LifecycleTimelineGroup[] {
  const sorted = [...cards].sort(
    (a, b) => new Date(b.event.timestamp).getTime() - new Date(a.event.timestamp).getTime(),
  );

  const groups = new Map<string, LifecycleTimelineCardModel[]>();
  for (const card of sorted) {
    const dateKey = startOfDay(new Date(card.event.timestamp)).toISOString();
    const bucket = groups.get(dateKey) ?? [];
    bucket.push(card);
    groups.set(dateKey, bucket);
  }

  return [...groups.entries()].map(([dateKey, bucket]) => {
    const date = new Date(dateKey);
    let label: string;
    if (isSameDay(date, now)) label = dateLabels.today;
    else if (isYesterday(date)) label = dateLabels.yesterday;
    else if (isThisWeek(date, { weekStartsOn: 1 })) label = dateLabels.lastWeek;
    else label = format(date, "MMMM d, yyyy");

    return { dateKey, label, cards: bucket };
  });
}

export function formatSlaRemainingLabel(
  dueAt: string | null | undefined,
  labels: { remainingMinutes: (count: number) => string; remainingHours: (count: number) => string; breached: string; notSet: string },
  now: Date = new Date(),
): string {
  if (!dueAt) return labels.notSet;
  const due = new Date(dueAt);
  const diffMs = due.getTime() - now.getTime();
  if (diffMs <= 0) return labels.breached;
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) return labels.remainingMinutes(minutes);
  const hours = Math.ceil(minutes / 60);
  return labels.remainingHours(hours);
}
