import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareTimelineEvents,
  paginateTimelineByCursor,
  sortTimelineEvents,
  TimelineCursorNotFoundError,
  type TimelineEvent,
} from "./index.js";

function event(
  id: string,
  timestamp: string,
  sourceModule: string,
): TimelineEvent {
  return {
    id,
    timestamp,
    actor: { id: null, label: null, type: "system" },
    eventType: "crm_update",
    title: id,
    description: null,
    metadata: {},
    sourceModule,
    entityType: "customer",
    entityId: "cust-1",
    companyId: "company-1",
  };
}

describe("timeline-query hardening", () => {
  it("uses sourceModule and id as secondary sort keys for equal timestamps", () => {
    const events = [
      event("b", "2026-07-25T10:00:00.000Z", "bookings"),
      event("a", "2026-07-25T10:00:00.000Z", "agent"),
      event("c", "2026-07-25T10:00:00.000Z", "notes"),
    ];

    const sorted = sortTimelineEvents(events, "newest");
    assert.deepEqual(
      sorted.map((item) => `${item.sourceModule}:${item.id}`),
      ["notes:c", "bookings:b", "agent:a"],
    );
  });

  it("keeps deterministic ordering across repeated sorts", () => {
    const events = [
      event("2", "2026-07-25T10:00:00.000Z", "crm"),
      event("1", "2026-07-25T10:00:00.000Z", "crm"),
      event("3", "2026-07-25T09:00:00.000Z", "crm"),
    ];

    const first = sortTimelineEvents(events, "newest").map((item) => item.id);
    const second = sortTimelineEvents(events, "newest").map((item) => item.id);
    assert.deepEqual(first, second);
    assert.deepEqual(first, ["2", "1", "3"]);
  });

  it("throws when cursor anchor is missing", () => {
    const sorted = sortTimelineEvents(
      [event("a", "2026-07-25T10:00:00.000Z", "crm")],
      "newest",
    );

    assert.throws(
      () =>
        paginateTimelineByCursor(sorted, {
          timestamp: "2026-07-25T09:00:00.000Z",
          id: "missing",
          sourceModule: "crm",
        }),
      TimelineCursorNotFoundError,
    );
  });

  it("matches cursor anchors by sourceModule", () => {
    const events = sortTimelineEvents(
      [
        event("shared", "2026-07-25T10:00:00.000Z", "crm"),
        event("shared", "2026-07-25T10:00:00.000Z", "email"),
      ],
      "newest",
    );

    const first = paginateTimelineByCursor(events, null, 1);
    assert.equal(first.page[0]?.sourceModule, "email");

    const second = paginateTimelineByCursor(events, first.nextCursor, 1);
    assert.equal(second.page[0]?.sourceModule, "crm");
  });

  it("orders oldest first with stable tie-breakers", () => {
    const left = event("a", "2026-07-25T10:00:00.000Z", "crm");
    const right = event("b", "2026-07-25T10:00:00.000Z", "crm");
    assert.ok(compareTimelineEvents(left, right, "oldest") < 0);
  });
});
