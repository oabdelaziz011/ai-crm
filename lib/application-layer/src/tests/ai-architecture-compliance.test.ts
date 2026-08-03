import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApplicationLayerRegistry, createContext } from "../index.js";
import { createMockApplicationPorts } from "../testing/mock-ports.js";
import { createConfiguredPlatformEventBus } from "@workspace/platform-events";

describe("GA-1.6A AI architecture compliance", () => {
  it("exposes unified AI coordinator through AIApplicationService", () => {
    const registry = createApplicationLayerRegistry({
      useMockPorts: true,
      eventBus: createConfiguredPlatformEventBus([], { awaitSubscribers: false }),
    });
    const services = registry.getServices();
    assert.ok(services.ai.coordinator);
    assert.ok(services.ai.coordinator.booking);
    assert.ok(services.ai.coordinator.lead);
    assert.ok(services.ai.coordinator.ticket);
    assert.ok(services.ai.coordinator.handoff);
    assert.ok(services.ai.coordinator.knowledge);
    assert.ok(services.ai.coordinator.context);
  });

  it("routes booking scheduling queries through SchedulingQueryPort", async () => {
    const ports = createMockApplicationPorts();
    let called = false;
    const schedulingQuery = {
      ...ports.schedulingQuery,
      async searchAvailability(input) {
        called = true;
        assert.equal(input.serviceId, "svc-1");
        return ports.schedulingQuery.searchAvailability(input);
      },
    };
    const registry = createApplicationLayerRegistry({
      ports: { ...ports, schedulingQuery },
      eventBus: createConfiguredPlatformEventBus([], { awaitSubscribers: false }),
    });
    const ctx = createContext({
      tenantId: "tenant-1",
      actorId: "user-1",
      permissions: ["availability.search"],
    });
    await registry.getServices().booking.searchAvailability(
      {
        tenantId: "tenant-1",
        actorUserId: "user-1",
        serviceId: "svc-1",
      },
      ctx,
    );
    assert.equal(called, true);
  });

  it("routes knowledge search through KnowledgeApplicationService query pipeline", async () => {
    const registry = createApplicationLayerRegistry({
      useMockPorts: true,
      eventBus: createConfiguredPlatformEventBus([], { awaitSubscribers: false }),
    });
    const ctx = createContext({
      tenantId: "tenant-1",
      actorId: "user-1",
      permissions: ["knowledge.view"],
    });
    const result = await registry.getServices().knowledge.searchKnowledge("refund", ctx);
    assert.equal(result.data.query, "refund");
  });

  it("publishes FeatureFlagUpdated on upsert", async () => {
    const registry = createApplicationLayerRegistry({
      useMockPorts: true,
      eventBus: createConfiguredPlatformEventBus([], { awaitSubscribers: true }),
    });
    const ctx = createContext({
      tenantId: "tenant-1",
      actorId: "user-1",
      permissions: ["feature_flags.write"],
    });
    const result = await registry.getServices().featureFlags.upsert(
      {
        featureKey: "ai.chat",
        scopeType: "company",
        enabled: true,
      },
      ctx,
    );
    assert.ok(result.data);
    assert.equal(result.data.featureKey, "ai.chat");
  });

  it("assembles unified AI context through ContextAssemblyService", async () => {
    const registry = createApplicationLayerRegistry({
      useMockPorts: true,
      eventBus: createConfiguredPlatformEventBus([], { awaitSubscribers: false }),
    });
    const ctx = createContext({
      tenantId: "tenant-1",
      actorId: "user-1",
      permissions: ["ai.read", "customers.view"],
    });
    const result = await registry.getServices().context.assemble(
      { customerId: "cust-1", knowledgeQuery: "policy" },
      ctx,
    );
    assert.ok(result.data.knowledge);
  });
});
