import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TimelineEventRegistry,
  TimelinePermissionDeniedError,
  TimelinePublishError,
  TimelineTenantIsolationError,
  InMemoryTimelineEventStore,
  TimelineEngine,
  type TimelineAccessContext,
  type TimelineEvent,
  type TimelinePublisher,
} from "./index.js";

function createContext(overrides?: Partial<TimelineAccessContext>): TimelineAccessContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => code === "customers.view" || code === "tickets.view",
    ...overrides,
  };
}

function sampleEvent(overrides?: Partial<TimelineEvent>): TimelineEvent {
  return {
    id: overrides?.id ?? "evt-1",
    timestamp: overrides?.timestamp ?? "2026-07-25T10:00:00.000Z",
    actor: overrides?.actor ?? { id: "user-1", label: "Agent", type: "employee" },
    eventType: overrides?.eventType ?? "crm_update",
    title: overrides?.title ?? "Customer updated",
    description: overrides?.description ?? "Phone number changed",
    metadata: overrides?.metadata ?? { field: "phone" },
    sourceModule: overrides?.sourceModule ?? "crm",
    entityType: overrides?.entityType ?? "customer",
    entityId: overrides?.entityId ?? "cust-1",
    companyId: overrides?.companyId ?? "company-1",
  };
}

function createPublisher(
  moduleId: string,
  events: TimelineEvent[],
  options?: Partial<TimelinePublisher>,
): TimelinePublisher {
  return {
    moduleId,
    sourceModule: options?.sourceModule ?? moduleId,
    entityTypes: options?.entityTypes ?? ["customer", "account"],
    supportedEventTypes: options?.supportedEventTypes ?? ["crm_update", "ticket_created"],
    requiredPermissions: options?.requiredPermissions,
    collect: async () => events,
  };
}

describe("TimelineEventRegistry", () => {
  it("registers publishers without modifying the engine", () => {
    const registry = new TimelineEventRegistry();
    registry.registerPublisher(createPublisher("crm", [sampleEvent()]));
    assert.equal(registry.listPublishers().length, 1);
    assert.ok(registry.getPublisher("crm"));
  });

  it("filters publishers by entity type", () => {
    const registry = new TimelineEventRegistry();
    registry.registerPublisher(
      createPublisher("crm", [], { sourceModule: "crm", entityTypes: ["customer"] }),
    );
    registry.registerPublisher(
      createPublisher("tickets", [], { sourceModule: "tickets", entityTypes: ["account"] }),
    );

    assert.equal(registry.listPublishersForEntity("customer").length, 1);
    assert.equal(registry.listPublishersForEntity("account").length, 1);
  });

  it("registers standalone event types", () => {
    const registry = new TimelineEventRegistry();
    registry.registerEventType({
      eventType: "system_event",
      sourceModule: "system",
      title: "System event",
    });
    assert.equal(registry.getEventTypeRegistration("system_event")?.title, "System event");
  });
});

describe("TimelineEngine", () => {
  it("orders events newest first by default", async () => {
    const registry = new TimelineEventRegistry();
    registry.registerPublisher(
      createPublisher("mixed", [
        sampleEvent({ id: "old", timestamp: "2026-07-20T10:00:00.000Z", title: "Old" }),
        sampleEvent({ id: "new", timestamp: "2026-07-25T10:00:00.000Z", title: "New" }),
      ]),
    );

    const engine = new TimelineEngine({ registry });
    const page = await engine.query(createContext(), {
      entityType: "customer",
      entityId: "cust-1",
      companyId: "company-1",
    });

    assert.equal(page.events[0]?.title, "New");
    assert.equal(page.events[1]?.title, "Old");
  });

  it("supports oldest-first ordering", async () => {
    const registry = new TimelineEventRegistry();
    registry.registerPublisher(
      createPublisher("mixed", [
        sampleEvent({ id: "old", timestamp: "2026-07-20T10:00:00.000Z" }),
        sampleEvent({ id: "new", timestamp: "2026-07-25T10:00:00.000Z" }),
      ]),
    );

    const engine = new TimelineEngine({ registry });
    const page = await engine.query(createContext(), {
      entityType: "customer",
      entityId: "cust-1",
      companyId: "company-1",
      sort: "oldest",
    });

    assert.equal(page.events[0]?.id, "old");
    assert.equal(page.events[1]?.id, "new");
  });

  it("paginates with cursor", async () => {
    const registry = new TimelineEventRegistry();
    registry.registerPublisher(
      createPublisher(
        "many",
        Array.from({ length: 5 }, (_, index) =>
          sampleEvent({
            id: `evt-${index}`,
            timestamp: `2026-07-2${index}T10:00:00.000Z`,
            title: `Event ${index}`,
          }),
        ),
      ),
    );

    const engine = new TimelineEngine({ registry });
    const first = await engine.query(createContext(), {
      entityType: "customer",
      entityId: "cust-1",
      companyId: "company-1",
      limit: 2,
    });

    assert.equal(first.events.length, 2);
    assert.ok(first.nextCursor);

    const second = await engine.query(createContext(), {
      entityType: "customer",
      entityId: "cust-1",
      companyId: "company-1",
      limit: 2,
      cursor: first.nextCursor,
    });

    assert.equal(second.events.length, 2);
    assert.notEqual(first.events[0]?.id, second.events[0]?.id);
  });

  it("filters by event type, module, and date range", async () => {
    const registry = new TimelineEventRegistry();
    registry.registerPublisher(
      createPublisher("crm", [
        sampleEvent({
          id: "crm",
          eventType: "crm_update",
          sourceModule: "crm",
          timestamp: "2026-07-21T10:00:00.000Z",
        }),
      ], { sourceModule: "crm", supportedEventTypes: ["crm_update"] }),
    );
    registry.registerPublisher(
      createPublisher("tickets", [
        sampleEvent({
          id: "ticket",
          eventType: "ticket_created",
          sourceModule: "tickets",
          timestamp: "2026-07-22T10:00:00.000Z",
        }),
      ], { sourceModule: "tickets", supportedEventTypes: ["ticket_created"] }),
    );
    registry.registerPublisher(
      createPublisher("email", [
        sampleEvent({
          id: "email",
          eventType: "email_sent",
          sourceModule: "email",
          timestamp: "2026-07-23T10:00:00.000Z",
        }),
      ], { sourceModule: "email", supportedEventTypes: ["email_sent"] }),
    );

    const engine = new TimelineEngine({ registry });
    const page = await engine.query(createContext(), {
      entityType: "customer",
      entityId: "cust-1",
      companyId: "company-1",
      filter: {
        eventTypes: ["ticket_created"],
        sourceModules: ["tickets"],
        dateFrom: "2026-07-22T00:00:00.000Z",
        dateTo: "2026-07-22T23:59:59.999Z",
      },
    });

    assert.equal(page.events.length, 1);
    assert.equal(page.events[0]?.id, "ticket");
  });

  it("denies access without customers.view", async () => {
    const registry = new TimelineEventRegistry();
    registry.registerPublisher(createPublisher("crm", [sampleEvent()]));
    const engine = new TimelineEngine({ registry });

    await assert.rejects(
      () =>
        engine.query(createContext({ hasPermission: () => false }), {
          entityType: "customer",
          entityId: "cust-1",
          companyId: "company-1",
        }),
      TimelinePermissionDeniedError,
    );
  });

  it("enforces tenant isolation", async () => {
    const registry = new TimelineEventRegistry();
    registry.registerPublisher(createPublisher("crm", [sampleEvent()]));
    const engine = new TimelineEngine({ registry });

    await assert.rejects(
      () =>
        engine.query(createContext({ companyId: "company-2" }), {
          entityType: "customer",
          entityId: "cust-1",
          companyId: "company-1",
        }),
      TimelineTenantIsolationError,
    );
  });

  it("enforces customer ownership through entity access port", async () => {
    const registry = new TimelineEventRegistry();
    registry.registerPublisher(createPublisher("crm", [sampleEvent()]));
    const engine = new TimelineEngine({
      registry,
      entityAccess: {
        assertEntityAccess: async (_ctx, scope) => {
          if (scope.entityId !== "cust-allowed") {
            throw new Error("Customer not found in tenant.");
          }
        },
      },
    });

    await assert.rejects(
      () =>
        engine.query(createContext(), {
          entityType: "customer",
          entityId: "cust-denied",
          companyId: "company-1",
        }),
      /Customer not found/,
    );
  });

  it("skips publishers when module permissions are missing", async () => {
    const registry = new TimelineEventRegistry();
    registry.registerPublisher(
      createPublisher("crm", [sampleEvent({ id: "crm" })], { requiredPermissions: ["customers.view"] }),
    );
    registry.registerPublisher(
      createPublisher("tickets", [sampleEvent({ id: "ticket", sourceModule: "tickets" })], {
        sourceModule: "tickets",
        requiredPermissions: ["tickets.view"],
      }),
    );

    const engine = new TimelineEngine({ registry });
    const page = await engine.query(createContext({ hasPermission: (code) => code === "customers.view" }), {
      entityType: "customer",
      entityId: "cust-1",
      companyId: "company-1",
    });

    assert.equal(page.events.length, 1);
    assert.equal(page.events[0]?.id, "crm");
  });

  it("publishes events through registered modules", async () => {
    const registry = new TimelineEventRegistry();
    const store = new InMemoryTimelineEventStore();
    registry.registerPublisher(
      createPublisher("workflows", [], {
        sourceModule: "workflows",
        supportedEventTypes: ["workflow_started"],
      }),
    );

    const engine = new TimelineEngine({ registry, eventStore: store });
    await engine.publish(createContext(), {
      timestamp: "2026-07-25T10:00:00.000Z",
      actor: { id: "system", label: "System", type: "system" },
      eventType: "workflow_started",
      title: "Workflow started",
      description: "Onboarding workflow",
      metadata: { workflowId: "wf-1" },
      sourceModule: "workflows",
      entityType: "customer",
      entityId: "cust-1",
      companyId: "company-1",
    });

    const page = await engine.query(createContext(), {
      entityType: "customer",
      entityId: "cust-1",
      companyId: "company-1",
    });

    assert.equal(page.events.length, 1);
    assert.equal(page.events[0]?.eventType, "workflow_started");
  });

  it("rejects publish for unregistered modules", async () => {
    const registry = new TimelineEventRegistry();
    const engine = new TimelineEngine({ registry, eventStore: new InMemoryTimelineEventStore() });

    await assert.rejects(
      () =>
        engine.publish(createContext(), {
          timestamp: "2026-07-25T10:00:00.000Z",
          actor: { id: null, label: null, type: "system" },
          eventType: "workflow_started",
          title: "Workflow started",
          description: null,
          metadata: {},
          sourceModule: "workflows",
          entityType: "customer",
          entityId: "cust-1",
          companyId: "company-1",
        }),
      TimelinePublishError,
    );
  });
});
