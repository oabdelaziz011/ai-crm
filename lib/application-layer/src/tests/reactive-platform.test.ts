import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createApplicationLayerRegistry,
  createContext,
  createProductionSubscribers,
} from "../index.js";
import {
  createConfiguredPlatformEventBus,
  createMemoryAuditTrailStore,
  createMemoryTimelineStore,
  createMemoryDeadLetterQueue,
  createMemoryEventTelemetry,
  createMemoryCorrelationStore,
  createMemoryIdempotencyStore,
} from "@workspace/platform-events";
import { createMockApplicationPorts } from "../testing/mock-ports.js";

describe("Reactive Platform GA-1.5 — production subscribers", () => {
  it("dispatches workspace subscriber on ConfigurationPublished", async () => {
    const ports = createMockApplicationPorts();
    const signals: string[] = [];
    const reactive = {
      async emit(input: { signalType: string }) {
        signals.push(input.signalType);
      },
    };
    const automation = { async dispatchFromPlatformEvent() {} };

    const tempRegistry = createApplicationLayerRegistry({
      useMockPorts: false,
      ports,
      eventBus: createConfiguredPlatformEventBus([], { awaitSubscribers: true }),
    });

    const eventBus = createConfiguredPlatformEventBus(
      createProductionSubscribers({
        getServices: () => tempRegistry.getServices(),
        ports,
        reactive,
        automation,
        buildSystemContext: (envelope) =>
          createContext({
            tenantId: envelope.tenantId,
            actorId: "system",
            permissions: ["*"],
            correlationId: envelope.correlationId,
          }),
      }),
      {
        auditStore: createMemoryAuditTrailStore(),
        timelineStore: createMemoryTimelineStore(),
        correlationStore: createMemoryCorrelationStore(),
        idempotencyStore: createMemoryIdempotencyStore(),
        deadLetterQueue: createMemoryDeadLetterQueue(),
        telemetry: createMemoryEventTelemetry(),
        awaitSubscribers: true,
      },
    );

    const registry = createApplicationLayerRegistry({ useMockPorts: false, ports, eventBus });
    const services = registry.getServices();
    const ctx = createContext({ tenantId: "tenant_1", actorId: "admin", permissions: ["*"] });

    await services.configuration.saveDraft(
      { domain: "operations.workspace", scopeKey: "clinic", config: { workspaceName: "Ops" } },
      ctx,
    );
    await services.configuration.publish({ domain: "operations.workspace", scopeKey: "clinic" }, ctx);

    assert.ok(signals.includes("workspace.config"));
  });
});
