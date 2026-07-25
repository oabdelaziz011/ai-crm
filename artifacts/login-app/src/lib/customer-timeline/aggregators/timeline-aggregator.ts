import type {
  TimelineActivity,
  TimelineActivitySource,
  TimelineEventProvider,
  TimelineFetchInput,
} from "@/lib/customer-timeline/types";

export function adaptLegacyProvider(provider: TimelineEventProvider): TimelineActivitySource {
  return {
    sourceId: provider.providerId,
    collect: (input) => provider.getEvents(input),
  };
}

function sortNewestFirst(activities: TimelineActivity[]): TimelineActivity[] {
  return [...activities].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}

/** Collects and normalizes activities from all registered sources — no business logic. */
export class TimelineAggregator {
  private sources = new Map<string, TimelineActivitySource>();

  registerSource(source: TimelineActivitySource): void {
    this.sources.set(String(source.sourceId), source);
  }

  registerLegacyProvider(provider: TimelineEventProvider): void {
    this.registerSource(adaptLegacyProvider(provider));
  }

  listSources(): TimelineActivitySource[] {
    return [...this.sources.values()];
  }

  async collect(input: TimelineFetchInput): Promise<TimelineActivity[]> {
    const sourceList = this.listSources();
    if (sourceList.length === 0) return [];

    const batches = await Promise.all(
      sourceList.map(async (source) => {
        try {
          return await source.collect(input);
        } catch {
          return [] as TimelineActivity[];
        }
      }),
    );

    const deduped = new Map<string, TimelineActivity>();
    for (const activity of batches.flat()) {
      deduped.set(activity.id, normalizeActivity(activity));
    }

    return sortNewestFirst([...deduped.values()]);
  }
}

function normalizeActivity(activity: TimelineActivity): TimelineActivity {
  return {
    ...activity,
    source: activity.source,
    metadata: {
      ...activity.metadata,
      searchText:
        activity.metadata?.searchText ??
        buildDefaultSearchText(activity),
    },
  };
}

function buildDefaultSearchText(activity: TimelineActivity): string {
  return [
    activity.type,
    activity.metadata?.detail,
    activity.metadata?.actor,
    activity.metadata?.bookingId,
    activity.metadata?.invoiceId,
    activity.metadata?.invoiceNumber,
    JSON.stringify(activity.payload),
  ]
    .filter(Boolean)
    .join(" ");
}

export const timelineAggregator = new TimelineAggregator();
