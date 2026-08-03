import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  createApplicationLayerRegistry,
  createContext,
  Customer360Aggregator,
  createMockApplicationPorts,
} from "../index.js";

describe("Customer360Aggregator", () => {
  let ports: ReturnType<typeof createMockApplicationPorts>;

  beforeEach(() => {
    ports = createMockApplicationPorts();
  });

  it("aggregates customer360 data in parallel with immutable DTO", async () => {
    const aggregator = new Customer360Aggregator({ ports });
    const context = createContext({ tenantId: "tenant_1", actorId: "user_1", permissions: ["*"] });

    const aggregate = await aggregator.aggregate({ customerId: "cust_1" }, context);
    assert.ok(aggregate);
    assert.equal(aggregate!.identity.customerId, "cust_1");
    assert.equal(aggregate!.identity.displayName, "Sara Hassan");
    assert.ok(aggregate!.timeline.recent.length >= 1);
    assert.equal(typeof aggregate!.telemetry.durationMs, "number");
  });

  it("returns null when customer is missing", async () => {
    const aggregator = new Customer360Aggregator({ ports });
    const context = createContext({ tenantId: "tenant_1", actorId: "user_1", permissions: ["*"] });

    const aggregate = await aggregator.aggregate({ customerId: "missing" }, context);
    assert.equal(aggregate, null);
  });

  it("continues when timeline port fails (partial failure)", async () => {
    const basePorts = createMockApplicationPorts();
    const failingPorts = {
      ...basePorts,
      timelineRead: {
        async listForEntity() {
          throw new Error("timeline unavailable");
        },
      },
    };

    const aggregator = new Customer360Aggregator({ ports: failingPorts });
    const context = createContext({ tenantId: "tenant_1", actorId: "user_1", permissions: ["*"] });
    const aggregate = await aggregator.aggregate({ customerId: "cust_1" }, context);

    assert.ok(aggregate);
    assert.equal(aggregate!.identity.customerId, "cust_1");
    assert.ok(aggregate!.warnings.some((warning) => warning.includes("timeline")));
  });

  it("enforces tenant isolation via customer read port", async () => {
    const aggregator = new Customer360Aggregator({ ports });
    const context = createContext({ tenantId: "other_tenant", actorId: "user_1", permissions: ["*"] });
    const aggregate = await aggregator.aggregate({ customerId: "cust_1" }, context);
    assert.equal(aggregate, null);
  });

  it("exposes aggregate via application service query pipeline", async () => {
    const registry = createApplicationLayerRegistry({ useMockPorts: true });
    const services = registry.getServices();
    const context = createContext({ tenantId: "tenant_1", actorId: "user_1", permissions: ["*"] });

    const result = await services.customer360.getCustomer360Aggregate({ customerId: "cust_1" }, context);
    assert.equal(result.data.identity.customerId, "cust_1");
    assert.ok(result.data.bookings.total >= 0);
  });
});
