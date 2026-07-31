import type { TimelineEventRegistry } from "./event-registry.js";
import { createTimelineEvent, type TimelineEventStore } from "./event-store.js";
import { TimelineCollector } from "./timeline-collector.js";
import { TimelinePublishError } from "./errors.js";
import { assertTimelineEntityAccess } from "./timeline-permissions.js";
import { queryTimelineEvents } from "./timeline-query.js";
import type {
  TimelineAccessContext,
  TimelineEntityAccessPort,
  TimelinePublishInput,
  TimelineQueryPage,
  TimelineQueryRequest,
} from "./types.js";

export type TimelineEngineOptions = {
  registry: TimelineEventRegistry;
  eventStore?: TimelineEventStore;
  entityAccess?: TimelineEntityAccessPort;
};

export class TimelineEngine {
  private readonly registry: TimelineEventRegistry;
  private readonly eventStore?: TimelineEventStore;
  private readonly entityAccess?: TimelineEntityAccessPort;
  private readonly collector: TimelineCollector;

  constructor(options: TimelineEngineOptions) {
    this.registry = options.registry;
    this.eventStore = options.eventStore;
    this.entityAccess = options.entityAccess;
    this.collector = new TimelineCollector(this.registry);
  }

  async query(ctx: TimelineAccessContext, request: TimelineQueryRequest): Promise<TimelineQueryPage> {
    await assertTimelineEntityAccess(ctx, request, this.entityAccess);

    const storeEvents = this.eventStore
      ? await this.eventStore.list({
          entityType: request.entityType,
          entityId: request.entityId,
          companyId: request.companyId,
          filter: request.filter,
        })
      : [];

    const collected = await this.collector.collect(
      ctx,
      {
        entityType: request.entityType,
        entityId: request.entityId,
        companyId: request.companyId,
        filter: request.filter,
      },
      storeEvents,
    );

    const result = queryTimelineEvents(collected, {
      filter: request.filter,
      additionalFilter: request.additionalFilter,
      sort: request.sort ?? "newest",
      cursor: request.cursor,
      limit: request.limit,
    });

    return {
      events: result.events,
      nextCursor: result.nextCursor,
      total: result.total,
      hasMore: result.hasMore,
    };
  }

  async publish(ctx: TimelineAccessContext, input: TimelinePublishInput): Promise<void> {
    if (!this.eventStore) {
      throw new TimelinePublishError(
        "TIMELINE_EVENT_STORE_UNAVAILABLE",
        "Timeline event store is not configured.",
      );
    }

    await assertTimelineEntityAccess(
      ctx,
      {
        entityType: input.entityType,
        entityId: input.entityId,
        companyId: input.companyId,
      },
      this.entityAccess,
    );

    const publisher = this.registry
      .listPublishers()
      .find((entry) => String(entry.sourceModule) === String(input.sourceModule));

    if (!publisher) {
      throw new TimelinePublishError(
        "TIMELINE_PUBLISHER_NOT_REGISTERED",
        `No timeline publisher registered for module "${input.sourceModule}".`,
      );
    }

    const supported = publisher.supportedEventTypes.map(String);
    if (!supported.includes(String(input.eventType))) {
      throw new TimelinePublishError(
        "TIMELINE_EVENT_TYPE_UNSUPPORTED",
        `Event type "${input.eventType}" is not registered for module "${input.sourceModule}".`,
      );
    }

    const event = createTimelineEvent(input);
    await this.eventStore.append(event);
  }
}
