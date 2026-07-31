import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyTimelineFilters,
  paginateTimelineByCursor,
  queryTimelineEvents,
  sortTimelineEvents,
  type TimelineEvent,
} from "./index.js";

function event(id: string, timestamp: string, eventType: string, sourceModule: string): TimelineEvent {
  return {
    id,
    timestamp,
    actor: { id: null, label: null, type: "system" },
    eventType,
    title: id,
    description: null,
    metadata: {},
    sourceModule,
    entityType: "customer",
    entityId: "cust-1",
    companyId: "company-1",
  };
}

describe("timeline-query", () => {
  const events = [
    event("a", "2026-07-20T10:00:00.000Z", "crm_update", "crm"),
    event("b", "2026-07-21T10:00:00.000Z", "ticket_created", "tickets"),
    event("c", "2026-07-22T10:00:00.000Z", "email_sent", "email"),
  ];

  it("sorts oldest first", () => {
    const sorted = sortTimelineEvents(events, "oldest");
    assert.deepEqual(sorted.map((item) => item.id), ["a", "b", "c"]);
  });

  it("filters by event type and module", () => {
    const filtered = applyTimelineFilters(events, {
      eventTypes: ["ticket_created"],
      sourceModules: ["tickets"],
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.id, "b");
  });

  it("paginates by cursor", () => {
    const sorted = sortTimelineEvents(events, "newest");
    const first = paginateTimelineByCursor(sorted, null, 2);
    assert.equal(first.page.length, 2);
    assert.ok(first.nextCursor);

    const second = paginateTimelineByCursor(sorted, first.nextCursor, 2);
    assert.equal(second.page.length, 1);
    assert.equal(second.nextCursor, null);
  });

  it("combines filter, sort, and pagination", () => {
    const result = queryTimelineEvents(events, {
      filter: { sourceModules: ["crm", "email"] },
      sort: "newest",
      limit: 1,
    });

    assert.equal(result.events.length, 1);
    assert.equal(result.events[0]?.sourceModule, "email");
    assert.equal(result.total, 2);
    assert.equal(result.hasMore, true);
  });
});
