import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { RetryEngine, RetryQueue } from "@workspace/platform-events";
import {
  createApplicationLayerRegistry,
  createContext,
  ValidationError,
  PermissionDeniedError,
  COMMAND_TYPES,
  QUERY_TYPES,
  validateCommand,
  mapCustomerTo360Projection,
} from "../index.js";
import type { PlatformEventBus } from "@workspace/platform-events";

describe("Application Layer — contracts", () => {
  it("registers all command and query types", () => {
    assert.equal(COMMAND_TYPES.length, 37);
    assert.equal(QUERY_TYPES.length, 37);
  });

  it("validates CreateCustomer command", () => {
    assert.throws(() => validateCommand("CreateCustomer", { displayName: "" }), ValidationError);
    assert.doesNotThrow(() => validateCommand("CreateCustomer", { displayName: "Sara Hassan" }));
  });
});

describe("Application Layer — mappers", () => {
  it("maps customer read model to Customer360 projection", () => {
    const projection = mapCustomerTo360Projection(
      {
        id: "cust_1",
        tenantId: "tenant_1",
        displayName: "Sara Hassan",
        isVip: true,
        outstandingBalanceCents: 4500,
        currentStatus: "Checked In",
        createdAt: new Date().toISOString(),
      },
      [],
    );
    assert.equal(projection.customerId, "cust_1");
    assert.equal(projection.summaryCards.length, 3);
  });
});

describe("Application Layer — CQRS integration", () => {
  let registry: ReturnType<typeof createApplicationLayerRegistry>;

  beforeEach(() => {
    registry = createApplicationLayerRegistry({ useMockPorts: true });
  });

  const adminContext = () =>
    createContext({
      tenantId: "tenant_1",
      actorId: "user_admin",
      permissions: ["*"],
    });

  it("executes CreateCustomer command and publishes event", async () => {
    const services = registry.getServices();
    const result = await services.customer.createCustomer(
      { displayName: "Ahmed Al-Rashid", email: "ahmed@example.com" },
      adminContext(),
    );
    assert.ok(result.data.customerId);
    assert.equal(result.correlationId.length > 0, true);
  });

  it("executes Customer360 query returning projection DTO", async () => {
    const services = registry.getServices();
    const result = await services.customer360.getCustomer360({ customerId: "cust_1" }, adminContext());
    assert.equal(result.data.displayName, "Sara Hassan");
    assert.equal(result.cached, false);
  });

  it("executes OperationsQueue query", async () => {
    const services = registry.getServices();
    const result = await services.operations.getQueue({}, adminContext());
    assert.ok(result.data.rows.length >= 1);
    assert.equal(typeof result.data.total, "number");
  });

  it("CheckOutCustomer publishes BookingCompleted via event bus", async () => {
    const services = registry.getServices();

    const createResult = await services.booking.createBooking(
      { customerId: "cust_1", scheduledAt: new Date().toISOString() },
      adminContext(),
    );

    const result = await services.operations.checkOutCustomer(
      { bookingId: createResult.data.bookingId },
      adminContext(),
    );
    assert.equal(result.data.status, "Completed");

    const eventBus = registry.resolve<PlatformEventBus>("eventBus");
    assert.ok(eventBus.getPublishLog().length > 0);
  });

  it("denies command without permission", async () => {
    const services = registry.getServices();
    const ctx = createContext({
      tenantId: "tenant_1",
      actorId: "user_guest",
      permissions: [],
    });
    await assert.rejects(
      () => services.customer.createCustomer({ displayName: "Test" }, ctx),
      PermissionDeniedError,
    );
  });

  it("CollectPayment command returns DTO not entity", async () => {
    const services = registry.getServices();
    const result = await services.payment.collectPayment(
      { customerId: "cust_1", amountCents: 5000, currency: "USD", method: "card" },
      adminContext(),
    );
    assert.ok(result.data.paymentId);
    assert.equal(typeof result.data.collectedAt, "string");
  });

  it("resolves services through DI registry", () => {
    const timeline = registry.resolve<{ getTimeline: unknown }>("timeline");
    assert.equal(typeof timeline.getTimeline, "function");
  });

  it("writes audit entry on command execution", async () => {
    const services = registry.getServices();
    const infra = registry.resolve<{ audit: { entries: Array<{ commandType: string }> } }>("infra");
    const before = infra.audit.entries.length;
    await services.customer.createCustomer({ displayName: "Audit Test" }, adminContext());
    assert.ok(infra.audit.entries.length > before);
  });
});

describe("Retry engine (pipeline infrastructure)", () => {
  it("applies exponential backoff", async () => {
    const engine = new RetryEngine(new RetryQueue(), { maxAttempts: 2, baseDelayMs: 1 });
    let n = 0;
    await assert.rejects(
      () =>
        engine.execute(async () => {
          n++;
          throw new Error("fail");
        }),
      Error,
    );
    assert.equal(n, 2);
  });
});
