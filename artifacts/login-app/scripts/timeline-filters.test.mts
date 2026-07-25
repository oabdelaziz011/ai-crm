import assert from "node:assert/strict";
import test from "node:test";
import {
  filterTimelineEvents,
  groupTimelineEventsByDate,
  searchTimelineEvents,
} from "../src/lib/customer-timeline/timeline-filters.ts";
import type { TimelineEvent } from "../src/lib/customer-timeline/types.ts";

function event(
  id: string,
  type: TimelineEvent["type"],
  occurredAt: string,
  extra: Partial<TimelineEvent> = {},
): TimelineEvent {
  return {
    id,
    type,
    occurredAt,
    source: "test",
    payload: {},
    ...extra,
  };
}

test("filterTimelineEvents filters by message group", () => {
  const events = [
    event("1", "whatsapp_message_received", "2026-07-25T10:00:00.000Z", {
      metadata: { filterGroup: "messages" },
    }),
    event("2", "booking_created", "2026-07-24T10:00:00.000Z", {
      metadata: { filterGroup: "bookings" },
    }),
  ];

  const filtered = filterTimelineEvents(events, "messages");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.type, "whatsapp_message_received");
});

test("searchTimelineEvents matches detail and actor text", () => {
  const events = [
    event("1", "note_added", "2026-07-25T10:00:00.000Z", {
      metadata: { detail: "Follow up tomorrow", actor: "Sarah", searchText: "follow up sarah" },
    }),
  ];

  assert.equal(searchTimelineEvents(events, "sarah").length, 1);
  assert.equal(searchTimelineEvents(events, "missing").length, 0);
});

test("groupTimelineEventsByDate preserves order within groups", () => {
  const events = [
    event("1", "invoice_created", "2026-07-25T12:00:00.000Z"),
    event("2", "booking_created", "2026-07-25T09:00:00.000Z"),
    event("3", "customer_created", "2026-07-24T09:00:00.000Z"),
  ];

  const groups = groupTimelineEventsByDate(events, "en");
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.events.length, 2);
  assert.equal(groups[1]?.events.length, 1);
});
