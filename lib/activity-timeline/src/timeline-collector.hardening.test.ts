import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TimelineEventRegistry } from "./event-registry.js";
import { TimelineCollector, filterEventsForTenant } from "./timeline-collector.js";
import type { TimelineAccessContext, TimelineEvent, TimelinePublisher } from "./types.js";

function createContext(): TimelineAccessContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: () => true,
  };
}

function sampleEvent(overrides?: Partial<TimelineEvent>): TimelineEvent {
  return {
    id: overrides?.id ?? "evt-1",
    timestamp: overrides?.timestamp ?? "2026-07-25T10:00:00.000Z",
    actor: overrides?.actor ?? { id: null, label: null, type: "system" },
    eventType: overrides?.eventType ?? "crm_update",
    title: overrides?.title ?? "Event",
    description: overrides?.description ?? null,
    metadata: overrides?.metadata ?? {},
    sourceModule: overrides?.sourceModule ?? "crm",
    entityType: overrides?.entityType ?? "customer",
    entityId: overrides?.entityId ?? "cust-1",
    companyId: overrides?.companyId ?? "company-1",
  };
}

describe("TimelineCollector hardening", () => {
  it("drops publisher events from another tenant", async () => {
    const registry = new TimelineEventRegistry();
    const publisher: TimelinePublisher = {
      moduleId: "crm",
      sourceModule: "crm",
      entityTypes: ["customer"],
      supportedEventTypes: ["crm_update"],
      collect: async () => [
        sampleEvent({ id: "allowed", companyId: "company-1" }),
        sampleEvent({ id: "blocked", companyId: "company-2" }),
      ],
    };
    registry.registerPublisher(publisher);

    const collector = new TimelineCollector(registry);
    const events = await collector.collect(createContext(), {
      entityType: "customer",
      entityId: "cust-1",
      companyId: "company-1",
    });

    assert.equal(events.length, 1);
    assert.equal(events[0]?.id, "allowed");
  });

  it("filters tenant events directly", () => {
    const filtered = filterEventsForTenant(
      [
        sampleEvent({ id: "keep", companyId: "company-1" }),
        sampleEvent({ id: "drop", companyId: "company-2" }),
      ],
      "company-1",
    );

    assert.deepEqual(filtered.map((event) => event.id), ["keep"]);
  });
});
