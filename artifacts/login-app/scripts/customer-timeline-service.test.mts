import assert from "node:assert/strict";
import test from "node:test";
import { CustomerTimelineService } from "../src/lib/customer-timeline/timeline-service.ts";
import type {
  TimelineEvent,
  TimelineEventProvider,
} from "../src/lib/customer-timeline/types.ts";

class StubProvider implements TimelineEventProvider {
  constructor(
    readonly providerId: string,
    private events: TimelineEvent[],
  ) {}

  async getEvents(): Promise<TimelineEvent[]> {
    return this.events;
  }
}

test("CustomerTimelineService merges providers and sorts newest first", async () => {
  const service = new CustomerTimelineService();
  service.registerProvider(
    new StubProvider("bookings", [
      {
        id: "bookings:1",
        type: "booking_created",
        occurredAt: "2026-07-20T10:00:00.000Z",
        source: "bookings",
        payload: {},
      },
    ]),
  );
  service.registerProvider(
    new StubProvider("customer-lifecycle", [
      {
        id: "lifecycle:1",
        type: "customer_created",
        occurredAt: "2026-07-25T10:00:00.000Z",
        source: "customer-lifecycle",
        payload: {},
      },
    ]),
  );

  const timeline = await service.getTimeline({ customerId: "cust-1" });

  assert.equal(timeline.length, 2);
  assert.equal(timeline[0]?.type, "customer_created");
  assert.equal(timeline[1]?.type, "booking_created");
});

test("CustomerTimelineService deduplicates events by id", async () => {
  const service = new CustomerTimelineService();
  const event: TimelineEvent = {
    id: "dup:1",
    type: "note_added",
    occurredAt: "2026-07-25T10:00:00.000Z",
    source: "notes",
    payload: {},
  };

  service.registerProvider(new StubProvider("a", [event]));
  service.registerProvider(new StubProvider("b", [event]));

  const timeline = await service.getTimeline({ customerId: "cust-1" });
  assert.equal(timeline.length, 1);
});

test("CustomerTimelineService isolates provider failures", async () => {
  const service = new CustomerTimelineService();
  service.registerProvider({
    providerId: "broken",
    async getEvents() {
      throw new Error("provider down");
    },
  });
  service.registerProvider(
    new StubProvider("ok", [
      {
        id: "ok:1",
        type: "customer_created",
        occurredAt: "2026-07-25T10:00:00.000Z",
        source: "ok",
        payload: {},
      },
    ]),
  );

  const timeline = await service.getTimeline({ customerId: "cust-1" });
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0]?.id, "ok:1");
});
