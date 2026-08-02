import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import type {
  AssignmentRecord,
  EscalationRecord,
  LifecycleTransitionResult,
  TimelineEvent,
  TimelineEventType,
} from "../types/lifecycle-types.js";
import { readLifecycleOverlay } from "../adapters/backend-state-adapter.js";

let timelineCounter = 0;

function nextTimelineId(): string {
  timelineCounter += 1;
  return `tl-${Date.now()}-${timelineCounter}`;
}

export function createTimelineEvent(
  partial: Omit<TimelineEvent, "id">,
): TimelineEvent {
  return { id: nextTimelineId(), ...partial };
}

export function messageToTimelineEvent(message: ConversationMessageRecord): TimelineEvent {
  const isInternal = message.message_type === "internal_note";
  return createTimelineEvent({
    conversationId: message.conversation_id,
    type: isInternal ? "internal_note" : "message",
    timestamp: message.created_at,
    actorId: message.created_by,
    actorLabel: message.participant_id,
    summary: isInternal ? "Internal note added" : message.content.slice(0, 120),
    payload: {
      messageId: message.id,
      messageType: message.message_type,
      contentType: message.content_type,
    },
  });
}

export function assignmentToTimelineEvent(record: AssignmentRecord): TimelineEvent {
  return createTimelineEvent({
    conversationId: record.conversationId,
    type: "assignment",
    timestamp: record.assignedAt,
    actorId: record.assignedByUserId,
    actorLabel: null,
    summary: `Assigned to ${record.targetLabel} (${record.targetType})`,
    payload: {
      assignmentId: record.id,
      targetType: record.targetType,
      targetId: record.targetId,
      method: record.method,
    },
  });
}

export function escalationToTimelineEvent(record: EscalationRecord): TimelineEvent {
  return createTimelineEvent({
    conversationId: record.conversationId,
    type: "escalation",
    timestamp: record.createdAt,
    actorId: record.createdByUserId,
    actorLabel: null,
    summary: `Escalated to ${record.targetLevel}: ${record.reason}`,
    payload: {
      escalationId: record.id,
      level: record.level,
      targetLevel: record.targetLevel,
      status: record.status,
      priority: record.priority,
    },
  });
}

export function transitionToTimelineEvent(
  transition: LifecycleTransitionResult,
  conversationId: string,
): TimelineEvent | null {
  if (!transition.allowed || !transition.timelineEvent) return null;
  return createTimelineEvent({
    ...transition.timelineEvent,
    conversationId,
    type: mapTransitionToTimelineType(transition.action),
  });
}

function mapTransitionToTimelineType(action: string): TimelineEventType {
  if (action === "take_over") return "human_takeover";
  if (action === "return_to_ai" || action === "ai_release" || action === "ai_own") {
    return "ai_takeover";
  }
  if (action === "close") return "close";
  if (action === "reopen") return "reopen";
  if (action === "assign" || action === "reassign" || action === "transfer") return "assignment";
  if (action === "escalate") return "escalation";
  if (action === "internal_note") return "internal_note";
  return "status_change";
}


function timelineEventKey(event: TimelineEvent): string {
  const payload = event.payload ?? {};
  if (typeof payload.assignmentId === "string") return `assignment:${payload.assignmentId}`;
  if (typeof payload.escalationId === "string") return `escalation:${payload.escalationId}`;
  if (typeof payload.messageId === "string") return `message:${payload.messageId}`;
  return `${event.type}:${event.timestamp}:${event.summary}`;
}

function dedupeTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  const unique: TimelineEvent[] = [];
  for (const event of events) {
    const key = timelineEventKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }
  return unique;
}

export type BuildTimelineInput = {
  conversationId: string;
  metadata: Record<string, unknown>;
  messages?: ConversationMessageRecord[];
  transitions?: LifecycleTransitionResult[];
};

export function buildConversationTimeline(input: BuildTimelineInput): TimelineEvent[] {
  const overlay = readLifecycleOverlay(input.metadata);
  const events: TimelineEvent[] = [];

  for (const message of input.messages ?? []) {
    events.push(messageToTimelineEvent(message));
  }

  for (const assignment of overlay?.assignmentHistory ?? []) {
    const storedAssignment = (overlay?.timelineEvents ?? []).some(
      (event) => event.payload?.assignmentId === assignment.id,
    );
    if (!storedAssignment) {
      events.push(assignmentToTimelineEvent(assignment));
    }
  }

  for (const escalation of overlay?.escalations ?? []) {
    events.push(escalationToTimelineEvent(escalation));
  }

  for (const stored of overlay?.timelineEvents ?? []) {
    events.push(stored);
  }

  for (const transition of input.transitions ?? []) {
    const event = transitionToTimelineEvent(transition, input.conversationId);
    if (event) events.push(event);
  }

  return dedupeTimelineEvents(events).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

export function appendTimelineEvent(
  metadata: Record<string, unknown>,
  event: Omit<TimelineEvent, "id">,
): Record<string, unknown> {
  const overlay = readLifecycleOverlay(metadata) ?? {};
  const stored = overlay.timelineEvents ?? [];
  const next = createTimelineEvent(event);
  return {
    ...metadata,
    lifecycle: {
      ...overlay,
      timelineEvents: [...stored, next],
    },
  };
}

export { dedupeTimelineEvents, timelineEventKey };

/** Test helper */
export function resetTimelineCounter(): void {
  timelineCounter = 0;
}
