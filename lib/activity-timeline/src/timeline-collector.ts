import type { TimelineEventRegistry } from "./event-registry.js";
import { dedupeTimelineEvents } from "./timeline-dedup.js";
import { filterPublishersByPermission } from "./timeline-permissions.js";
import type {
  TimelineAccessContext,
  TimelineCollectInput,
  TimelineEvent,
  TimelinePublisher,
} from "./types.js";

export function filterEventsForTenant(
  events: TimelineEvent[],
  companyId: string,
): TimelineEvent[] {
  return events.filter((event) => event.companyId === companyId);
}

export class TimelineCollector {
  constructor(private readonly registry: TimelineEventRegistry) {}

  resolvePublishers(input: TimelineCollectInput, ctx: TimelineAccessContext): TimelinePublisher[] {
    const publishers = this.registry.listPublishersForEntity(input.entityType);
    const permitted = filterPublishersByPermission(ctx, publishers);

    const moduleFilter = input.filter?.sourceModules;
    if (!moduleFilter?.length) return permitted;

    const narrowed = permitted.filter((publisher) =>
      moduleFilter.map(String).includes(String(publisher.sourceModule)),
    );
    return narrowed.length > 0 ? narrowed : permitted;
  }

  async collectFromPublishers(
    ctx: TimelineAccessContext,
    input: TimelineCollectInput,
    publishers: TimelinePublisher[],
  ): Promise<TimelineEvent[]> {
    if (publishers.length === 0) return [];

    const batches = await Promise.all(
      publishers.map(async (publisher) => {
        try {
          const events = await publisher.collect(ctx, input);
          return filterEventsForTenant(events, input.companyId);
        } catch {
          return [] as TimelineEvent[];
        }
      }),
    );

    return dedupeTimelineEvents(batches.flat());
  }

  async collect(
    ctx: TimelineAccessContext,
    input: TimelineCollectInput,
    extraEvents: TimelineEvent[] = [],
  ): Promise<TimelineEvent[]> {
    const publishers = this.resolvePublishers(input, ctx);
    const collected = await this.collectFromPublishers(ctx, input, publishers);
    const scopedStoreEvents = filterEventsForTenant(extraEvents, input.companyId);
    return dedupeTimelineEvents([...collected, ...scopedStoreEvents]);
  }
}
