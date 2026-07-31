import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dedupeTimelineEvents, timelineEventDedupKey } from "./timeline-dedup.js";
import type { TimelineEvent } from "./types.js";

function sample(id: string, sourceModule: string): TimelineEvent {
  return {
    id,
    timestamp: "2026-07-25T10:00:00.000Z",
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

describe("timeline-dedup", () => {
  it("builds composite keys from sourceModule and id", () => {
    assert.equal(timelineEventDedupKey(sample("evt-1", "crm")), "crm:evt-1");
  });

  it("preserves events with the same id across different modules", () => {
    const deduped = dedupeTimelineEvents([
      sample("shared", "crm"),
      sample("shared", "email"),
    ]);

    assert.equal(deduped.length, 2);
  });

  it("deduplicates repeated composite keys by last writer", () => {
    const deduped = dedupeTimelineEvents([
      { ...sample("evt-1", "crm"), title: "first" },
      { ...sample("evt-1", "crm"), title: "second" },
    ]);

    assert.equal(deduped.length, 1);
    assert.equal(deduped[0]?.title, "second");
  });
});
