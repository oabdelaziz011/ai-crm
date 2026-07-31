import type {
  TimelineEntityType,
  TimelineEventType,
  TimelinePublisher,
  TimelineSourceModule,
} from "./types.js";

export type TimelineEventTypeRegistration = {
  eventType: TimelineEventType;
  sourceModule: TimelineSourceModule;
  title: string;
  description?: string | null;
};

export class TimelineEventRegistry {
  private readonly publishers = new Map<string, TimelinePublisher>();
  private readonly eventTypes = new Map<string, TimelineEventTypeRegistration>();

  registerPublisher(publisher: TimelinePublisher): void {
    this.publishers.set(publisher.moduleId, publisher);
    for (const eventType of publisher.supportedEventTypes) {
      if (!this.eventTypes.has(String(eventType))) {
        this.eventTypes.set(String(eventType), {
          eventType,
          sourceModule: publisher.sourceModule,
          title: String(eventType),
        });
      }
    }
  }

  registerEventType(registration: TimelineEventTypeRegistration): void {
    this.eventTypes.set(String(registration.eventType), registration);
  }

  unregisterPublisher(moduleId: string): void {
    this.publishers.delete(moduleId);
  }

  getPublisher(moduleId: string): TimelinePublisher | undefined {
    return this.publishers.get(moduleId);
  }

  listPublishers(): TimelinePublisher[] {
    return [...this.publishers.values()];
  }

  listPublishersForEntity(entityType: TimelineEntityType): TimelinePublisher[] {
    return this.listPublishers().filter((publisher) =>
      publisher.entityTypes.map(String).includes(String(entityType)),
    );
  }

  getEventTypeRegistration(eventType: TimelineEventType): TimelineEventTypeRegistration | undefined {
    return this.eventTypes.get(String(eventType));
  }

  listEventTypes(): TimelineEventTypeRegistration[] {
    return [...this.eventTypes.values()];
  }
}

export const globalTimelineEventRegistry = new TimelineEventRegistry();
