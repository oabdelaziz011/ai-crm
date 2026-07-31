import assert from "node:assert/strict";
import test from "node:test";
import {
  TimelineAccessRequiredError,
  TimelineCursorNotFoundError,
} from "@workspace/activity-timeline";
import {
  TimelineAggregator,
} from "../src/lib/customer-timeline/aggregators/timeline-aggregator.ts";
import { CustomerTimelineRepository } from "../src/lib/customer-timeline/repositories/customer-timeline-repository.ts";
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

const allowAllEntityAccess = {
  assertEntityAccess: async () => {},
};

function createRepository(events: TimelineEvent[], aggregator?: TimelineAggregator) {
  const resolvedAggregator = aggregator ?? new TimelineAggregator();
  if (!aggregator) {
    resolvedAggregator.registerLegacyProvider(new StubProvider("bookings", events));
  }
  return new CustomerTimelineRepository(resolvedAggregator, allowAllEntityAccess);
}

const access = {
  userId: "user-1",
  companyId: "company-1",
  isSuperAdmin: false,
  hasPermission: (code: string) => code === "customers.view",
};

test("CustomerTimelineRepository merges providers and sorts newest first", async () => {
  const repository = createRepository([
    {
      id: "bookings:1",
      type: "booking_created",
      occurredAt: "2026-07-20T10:00:00.000Z",
      source: "bookings",
      payload: {},
    },
    {
      id: "lifecycle:1",
      type: "customer_created",
      occurredAt: "2026-07-25T10:00:00.000Z",
      source: "lifecycle",
      payload: {},
    },
  ]);

  const page = await repository.fetchPage({
    customerId: "cust-1",
    companyId: "company-1",
    access,
  });

  assert.equal(page.activities.length, 2);
  assert.equal(page.activities[0]?.type, "customer_created");
  assert.equal(page.activities[1]?.type, "booking_created");
});

test("CustomerTimelineRepository paginates with cursor", async () => {
  const repository = createRepository(
    Array.from({ length: 4 }, (_, index) => ({
      id: `evt-${index}`,
      type: "note_added",
      occurredAt: `2026-07-2${index}T10:00:00.000Z`,
      source: "notes",
      payload: {},
    })),
  );

  const first = await repository.fetchPage({
    customerId: "cust-1",
    companyId: "company-1",
    limit: 2,
    access,
  });

  assert.equal(first.activities.length, 2);
  assert.ok(first.nextCursor);

  const second = await repository.fetchPage({
    customerId: "cust-1",
    companyId: "company-1",
    limit: 2,
    cursor: first.nextCursor,
    access,
  });

  assert.equal(second.activities.length, 2);
});

test("CustomerTimelineRepository rejects stale cursors", async () => {
  const repository = createRepository([
    {
      id: "evt-1",
      type: "note_added",
      occurredAt: "2026-07-25T10:00:00.000Z",
      source: "notes",
      payload: {},
    },
  ]);

  await assert.rejects(
    () =>
      repository.fetchPage({
        customerId: "cust-1",
        companyId: "company-1",
        access,
        cursor: {
          occurredAt: "2026-07-24T10:00:00.000Z",
          id: "missing",
          sourceModule: "notes",
        },
      }),
    TimelineCursorNotFoundError,
  );
});

test("CustomerTimelineRepository requires access context", async () => {
  const repository = createRepository([]);

  await assert.rejects(
    () =>
      repository.fetchPage({
        customerId: "cust-1",
        companyId: "company-1",
      } as never),
    TimelineAccessRequiredError,
  );
});

test("CustomerTimelineRepository filters by source module before pagination", async () => {
  const repository = createRepository([
    {
      id: "bookings:1",
      type: "booking_created",
      occurredAt: "2026-07-25T10:00:00.000Z",
      source: "bookings",
      payload: {},
    },
    {
      id: "notes:1",
      type: "note_added",
      occurredAt: "2026-07-24T10:00:00.000Z",
      source: "notes",
      payload: {},
    },
  ]);

  const page = await repository.fetchPage({
    customerId: "cust-1",
    companyId: "company-1",
    access,
    filter: { sourceModules: ["bookings"] },
  });

  assert.equal(page.activities.length, 1);
  assert.equal(page.activities[0]?.source, "bookings");
});

test("CustomerTimelineRepository denies cross-tenant access", async () => {
  const repository = createRepository([
    {
      id: "bookings:1",
      type: "booking_created",
      occurredAt: "2026-07-25T10:00:00.000Z",
      source: "bookings",
      payload: {},
    },
  ]);

  await assert.rejects(
    () =>
      repository.fetchPage({
        customerId: "cust-1",
        companyId: "company-1",
        access: {
          ...access,
          companyId: "company-2",
        },
      }),
    /Tenant isolation violation/,
  );
});

test("CustomerTimelineRepository deduplicates by sourceModule and id", async () => {
  const event = {
    id: "shared",
    type: "note_added" as const,
    occurredAt: "2026-07-25T10:00:00.000Z",
    source: "notes",
    payload: {},
  };

  const aggregator = new TimelineAggregator();
  aggregator.registerLegacyProvider(
    new StubProvider("notes", [{ ...event, source: "notes" }]),
  );
  aggregator.registerLegacyProvider(
    new StubProvider("email", [{ ...event, source: "email" }]),
  );
  const repository = new CustomerTimelineRepository(aggregator, allowAllEntityAccess);

  const page = await repository.fetchPage({
    customerId: "cust-1",
    companyId: "company-1",
    access,
  });

  assert.equal(page.activities.length, 2);
});

test("CustomerTimelineRepository isolates provider failures", async () => {
  const aggregator = new TimelineAggregator();
  aggregator.registerLegacyProvider({
    providerId: "broken",
    async getEvents() {
      throw new Error("provider down");
    },
  });
  aggregator.registerLegacyProvider(
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

  const repository = new CustomerTimelineRepository(aggregator, allowAllEntityAccess);
  const page = await repository.fetchPage({
    customerId: "cust-1",
    companyId: "company-1",
    access,
  });

  assert.equal(page.activities.length, 1);
  assert.equal(page.activities[0]?.id, "ok:1");
});

test("CustomerTimelineRepository fetchAll enforces access", async () => {
  const repository = createRepository([]);

  await assert.rejects(
    () =>
      repository.fetchAll({
        customerId: "cust-1",
        companyId: "company-1",
      } as never),
    TimelineAccessRequiredError,
  );
});
