import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  createConfiguredPlatformEventBus,
  createDefaultSubscribers,
  createModulePublisher,
  BookingEventPublisher,
  EventValidationError,
  validatePayload,
  PLATFORM_EVENT_REGISTRY,
  PLATFORM_EVENT_TYPES,
  RetryEngine,
  RetryQueue,
  InvoiceSubscriber,
  PaymentSubscriber,
  DashboardSubscriber,
  NotificationSubscriber,
  WorkspaceSubscriber,
  type PlatformEventSubscriber,
  createMemoryAuditTrailStore,
  createMemoryTimelineStore,
  createMemoryDeadLetterQueue,
  createMemoryEventTelemetry,
} from "../index.js";

describe("Platform Event Contracts", () => {
  it("registers all platform event types", () => {
    assert.equal(PLATFORM_EVENT_TYPES.length, 60);
  });

  it("rejects invalid BookingCompleted payload", () => {
    assert.throws(
      () => validatePayload("BookingCompleted", { bookingId: "" }),
      EventValidationError,
    );
  });

  it("accepts valid PaymentCollected payload", () => {
    assert.doesNotThrow(() =>
      validatePayload("PaymentCollected", {
        paymentId: "pay_1",
        customerId: "cust_1",
        amountCents: 5000,
        currency: "USD",
        method: "card",
      }),
    );
  });
});

describe("Retry Engine", () => {
  it("retries with exponential backoff then succeeds", async () => {
    const engine = new RetryEngine(new RetryQueue(), { maxAttempts: 3, baseDelayMs: 1 });
    let attempts = 0;
    const result = await engine.execute(async () => {
      attempts++;
      if (attempts < 3) throw new Error("transient");
      return "ok";
    });
    assert.equal(result, "ok");
    assert.equal(attempts, 3);
  });

  it("enqueues failed delivery to retry queue", () => {
    const queue = new RetryQueue();
    const engine = new RetryEngine(queue);
    const entry = engine.enqueueFailed({
      subscriberId: "invoice",
      eventId: "evt_1",
      eventType: "BookingCompleted",
      attempt: 1,
      error: "timeout",
    });
    assert.equal(entry.attempt, 2);
    assert.equal(queue.list().length, 1);
  });
});

describe("Platform Event Bus — integration", () => {
  let auditStore: ReturnType<typeof createMemoryAuditTrailStore>;
  let timelineStore: ReturnType<typeof createMemoryTimelineStore>;
  let dlq: ReturnType<typeof createMemoryDeadLetterQueue>;
  let telemetry: ReturnType<typeof createMemoryEventTelemetry>;
  let invoice: InvoiceSubscriber;
  let payment: PaymentSubscriber;
  let dashboard: DashboardSubscriber;
  let notification: NotificationSubscriber;
  let workspace: WorkspaceSubscriber;

  beforeEach(() => {
    auditStore = createMemoryAuditTrailStore();
    timelineStore = createMemoryTimelineStore();
    dlq = createMemoryDeadLetterQueue();
    telemetry = createMemoryEventTelemetry();
    invoice = new InvoiceSubscriber();
    payment = new PaymentSubscriber();
    dashboard = new DashboardSubscriber();
    notification = new NotificationSubscriber();
    workspace = new WorkspaceSubscriber();
  });

  function createBus(extra: PlatformEventSubscriber[] = []) {
    return createConfiguredPlatformEventBus(
      [invoice, payment, dashboard, notification, workspace, ...extra],
      { auditStore, timelineStore, deadLetterQueue: dlq, telemetry },
    );
  }

  it("publishes BookingCompleted to isolated subscribers only", async () => {
    const bus = createBus();
    const publisher = new BookingEventPublisher(createModulePublisher(bus, "booking"));

    await publisher.publishBookingCompleted(
      { bookingId: "bk_1", customerId: "cust_1", completedAt: new Date().toISOString() },
      { tenantId: "tenant_1", actorId: "user_1", actorType: "user" },
    );

    assert.equal(invoice.handled.length, 1);
    assert.equal(payment.handled.length, 1);
    assert.equal(dashboard.handled.length, 1);
    assert.equal(notification.handled.length, 1);
    assert.equal(workspace.handled.length, 1);
    assert.equal(invoice.handled[0]!.eventType, "BookingCompleted");
  });

  it("creates audit trail for every published event", async () => {
    const bus = createBus();
    const publisher = createModulePublisher(bus, "booking");
    await publisher.publish(
      "BookingCompleted",
      { bookingId: "bk_2", customerId: "cust_2", completedAt: new Date().toISOString() },
      { tenantId: "tenant_1", sourceModule: "booking", entityType: "booking", entityId: "bk_2" },
    );

    const auditEntries = await auditStore.list("tenant_1");
    assert.equal(auditEntries.length, 1);
    assert.equal(auditEntries[0]!.eventType, "BookingCompleted");
    assert.equal(auditEntries[0]!.correlationId.length > 0, true);
  });

  it("creates timeline activity for every published event", async () => {
    const bus = createBus();
    const publisher = createModulePublisher(bus, "booking");
    await publisher.publish(
      "BookingCompleted",
      { bookingId: "bk_3", customerId: "cust_3", completedAt: new Date().toISOString() },
      { tenantId: "tenant_1", sourceModule: "booking", entityType: "customer", entityId: "cust_3" },
    );

    const activities = await timelineStore.listForEntity("customer", "cust_3");
    assert.equal(activities.length, 1);
    assert.equal(activities[0]!.eventType, "BookingCompleted");
  });

  it("preserves event ordering in publish log", async () => {
    const bus = createBus();
    const publisher = createModulePublisher(bus, "booking");

    await publisher.publish(
      "BookingCreated",
      { bookingId: "bk_a", customerId: "cust_1", scheduledAt: new Date().toISOString() },
      { tenantId: "tenant_1", sourceModule: "booking", entityType: "booking", entityId: "bk_a" },
    );
    await publisher.publish(
      "BookingCompleted",
      { bookingId: "bk_a", customerId: "cust_1", completedAt: new Date().toISOString() },
      { tenantId: "tenant_1", sourceModule: "booking", entityType: "booking", entityId: "bk_a" },
    );

    const log = bus.getPublishLog();
    assert.equal(log.length, 2);
    assert.equal(log[0]!.envelope.eventType, "BookingCreated");
    assert.equal(log[1]!.envelope.eventType, "BookingCompleted");
  });

  it("routes failed subscribers to dead letter queue", async () => {
    const failingSubscriber: PlatformEventSubscriber = {
      subscriberId: "failing",
      subscribedEvents: ["BookingCompleted"],
      handle: async () => {
        throw new Error("subscriber down");
      },
    };

    const bus = createConfiguredPlatformEventBus([failingSubscriber], {
      auditStore,
      timelineStore,
      deadLetterQueue: dlq,
      telemetry,
      retryEngine: new RetryEngine(new RetryQueue(), { maxAttempts: 1, baseDelayMs: 1 }),
    });

    const publisher = createModulePublisher(bus, "booking");
    await publisher.publish(
      "BookingCompleted",
      { bookingId: "bk_fail", customerId: "cust_1", completedAt: new Date().toISOString() },
      { tenantId: "tenant_1", sourceModule: "booking", entityType: "booking", entityId: "bk_fail" },
    );

    const deadLetters = await dlq.list();
    assert.equal(deadLetters.length, 1);
    assert.equal(deadLetters[0]!.subscriberId, "failing");
    assert.equal(telemetry.snapshot().failures, 1);
  });

  it("records telemetry metrics", async () => {
    const bus = createBus();
    const publisher = createModulePublisher(bus, "booking");
    await publisher.publish(
      "BookingCompleted",
      { bookingId: "bk_t", customerId: "cust_1", completedAt: new Date().toISOString() },
      { tenantId: "tenant_1", sourceModule: "booking", entityType: "booking", entityId: "bk_t" },
    );

    const snap = telemetry.snapshot();
    assert.equal(snap.published, 1);
    assert.ok(Object.keys(snap.subscribers).length >= 4);
  });

  it("workspace subscriber receives all events without querying modules", async () => {
    const bus = createBus();
    const publisher = createModulePublisher(bus, "crm");
    await publisher.publish(
      "CustomerCreated",
      { customerId: "cust_w", displayName: "Test User" },
      { tenantId: "tenant_1", sourceModule: "crm", entityType: "customer", entityId: "cust_w" },
    );

    assert.equal(workspace.handled.length, 1);
    assert.equal(invoice.handled.length, 0);
  });
});

describe("Default subscribers factory", () => {
  it("creates 8 isolated subscribers", () => {
    const subs = createDefaultSubscribers();
    assert.equal(subs.length, 8);
    const ids = subs.map((s) => s.subscriberId);
    assert.ok(ids.includes("invoice"));
    assert.ok(ids.includes("workspace"));
  });
});
