import type { TimelineCollectInput, TimelineEvent, TimelinePublishInput } from "./types.js";

export interface TimelineEventStore {
  append(event: TimelineEvent): Promise<TimelineEvent>;
  list(input: TimelineCollectInput): Promise<TimelineEvent[]>;
}

export class InMemoryTimelineEventStore implements TimelineEventStore {
  private events: TimelineEvent[] = [];

  async append(event: TimelineEvent): Promise<TimelineEvent> {
    this.events.push(event);
    return event;
  }

  async list(input: TimelineCollectInput): Promise<TimelineEvent[]> {
    return this.events.filter(
      (event) =>
        event.entityType === input.entityType &&
        event.entityId === input.entityId &&
        event.companyId === input.companyId,
    );
  }

  snapshot(): TimelineEvent[] {
    return [...this.events];
  }
}

export function createTimelineEvent(input: TimelinePublishInput): TimelineEvent {
  return {
    id: input.id ?? `${input.sourceModule}:${input.entityId}:${input.timestamp}:${crypto.randomUUID()}`,
    timestamp: input.timestamp,
    actor: input.actor,
    eventType: input.eventType,
    title: input.title,
    description: input.description,
    metadata: input.metadata,
    sourceModule: input.sourceModule,
    entityType: input.entityType,
    entityId: input.entityId,
    companyId: input.companyId,
  };
}
