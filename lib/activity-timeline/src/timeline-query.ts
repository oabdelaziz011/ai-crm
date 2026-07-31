import { TimelineCursorNotFoundError } from "./errors.js";
import type {
  TimelineCursor,
  TimelineEvent,
  TimelineQueryFilter,
  TimelineSortOrder,
} from "./types.js";

const DEFAULT_LIMIT = 30;

function compareOldestFirst(a: TimelineEvent, b: TimelineEvent): number {
  const timeDelta = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  if (timeDelta !== 0) return timeDelta;

  const moduleDelta = String(a.sourceModule).localeCompare(String(b.sourceModule));
  if (moduleDelta !== 0) return moduleDelta;

  return String(a.id).localeCompare(String(b.id));
}

export function compareTimelineEvents(
  a: TimelineEvent,
  b: TimelineEvent,
  sort: TimelineSortOrder = "newest",
): number {
  const oldestFirst = compareOldestFirst(a, b);
  return sort === "oldest" ? oldestFirst : -oldestFirst;
}

export function applyTimelineFilters(
  events: TimelineEvent[],
  filter?: TimelineQueryFilter,
  additionalFilter?: (event: TimelineEvent) => boolean,
): TimelineEvent[] {
  let filtered = events;

  if (filter) {
    filtered = filtered.filter((event) => {
      if (filter.dateFrom && event.timestamp < filter.dateFrom) return false;
      if (filter.dateTo && event.timestamp > filter.dateTo) return false;

      if (filter.eventTypes?.length && !filter.eventTypes.includes(event.eventType)) {
        return false;
      }

      if (filter.sourceModules?.length && !filter.sourceModules.includes(event.sourceModule)) {
        return false;
      }

      if (filter.search?.trim()) {
        const haystack = [
          event.title,
          event.description,
          event.eventType,
          event.sourceModule,
          event.actor.label,
          JSON.stringify(event.metadata),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(filter.search.trim().toLowerCase())) return false;
      }

      return true;
    });
  }

  if (additionalFilter) {
    filtered = filtered.filter(additionalFilter);
  }

  return filtered;
}

export function sortTimelineEvents(
  events: TimelineEvent[],
  sort: TimelineSortOrder = "newest",
): TimelineEvent[] {
  return [...events].sort((a, b) => compareTimelineEvents(a, b, sort));
}

export function timelineCursorMatches(event: TimelineEvent, cursor: TimelineCursor): boolean {
  return (
    event.timestamp === cursor.timestamp &&
    event.id === cursor.id &&
    String(event.sourceModule) === String(cursor.sourceModule)
  );
}

export function paginateTimelineByCursor(
  events: TimelineEvent[],
  cursor: TimelineCursor | null | undefined,
  limit: number = DEFAULT_LIMIT,
): { page: TimelineEvent[]; nextCursor: TimelineCursor | null } {
  let startIndex = 0;

  if (cursor) {
    startIndex = events.findIndex((event) => timelineCursorMatches(event, cursor));
    if (startIndex < 0) {
      throw new TimelineCursorNotFoundError();
    }
    startIndex += 1;
  }

  const page = events.slice(startIndex, startIndex + limit);
  const last = page[page.length - 1];
  const nextCursor =
    startIndex + limit < events.length && last
      ? {
          timestamp: last.timestamp,
          id: last.id,
          sourceModule: last.sourceModule,
        }
      : null;

  return { page, nextCursor };
}

export function queryTimelineEvents(
  events: TimelineEvent[],
  options: {
    filter?: TimelineQueryFilter;
    additionalFilter?: (event: TimelineEvent) => boolean;
    sort?: TimelineSortOrder;
    cursor?: TimelineCursor | null;
    limit?: number;
  },
): { events: TimelineEvent[]; nextCursor: TimelineCursor | null; total: number; hasMore: boolean } {
  const filtered = applyTimelineFilters(events, options.filter, options.additionalFilter);
  const sorted = sortTimelineEvents(filtered, options.sort ?? "newest");
  const { page, nextCursor } = paginateTimelineByCursor(
    sorted,
    options.cursor,
    options.limit ?? DEFAULT_LIMIT,
  );

  return {
    events: page,
    nextCursor,
    total: sorted.length,
    hasMore: Boolean(nextCursor),
  };
}
