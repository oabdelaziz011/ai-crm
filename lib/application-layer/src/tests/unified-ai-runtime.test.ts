import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApplicationLayerRegistry, createContext } from "../index.js";
import { createMockApplicationPorts } from "../testing/mock-ports.js";
import { createConfiguredPlatformEventBus } from "@workspace/platform-events";
import { UnifiedMemoryPipeline } from "../services/unified-memory-pipeline.js";
import { createRuntimeContextCache } from "../cache/runtime-context-cache.js";
import { UnifiedEnterpriseAIRuntime } from "../services/unified-enterprise-ai-runtime.js";
import { createAIRuntimeContextSubscriber } from "../subscribers/ai-runtime-context-subscriber.js";
import type { EnterpriseRuntimeCoordinatorPort } from "../ports/ai-runtime-port.js";

describe("GA-1.6B Unified Enterprise AI Runtime", () => {
  it("executes through AIApplicationService unified entry", async () => {
    let coordinatorCalled = false;
    const coordinator: EnterpriseRuntimeCoordinatorPort = {
      async execute() {
        coordinatorCalled = true;
        return {
          runtimeId: "rt-1",
          executionId: "exec-1",
          correlationId: "corr-1",
          executionTimeMs: 42,
          intentKey: "general",
          providerKey: "openai",
          responseContent: "Hello",
          tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        };
      },
    };

    const registry = createApplicationLayerRegistry({
      useMockPorts: true,
      runtimeCoordinator: coordinator,
      eventBus: createConfiguredPlatformEventBus([], { awaitSubscribers: false }),
    });
    const services = registry.getServices();
    const ctx = createContext({
      tenantId: "tenant-1",
      actorId: "user-1",
      permissions: ["ai.read"],
    });

    const result = await services.ai.execute(
      { userId: "user-1", companyId: "tenant-1", isSuperAdmin: false, hasPermission: () => true },
      ctx,
      {
        companyId: "tenant-1",
        conversationId: "conv-1",
        messageText: "Hello",
      },
    );

    assert.equal(coordinatorCalled, true);
    assert.equal(result.responseContent, "Hello");
  });

  it("loads unified memory from assembled context", () => {
    const pipeline = new UnifiedMemoryPipeline();
    const memory = pipeline.load(
      {
        conversationId: "conv-1",
        correlationId: "corr-1",
        assembled: Object.freeze({
          customer: { id: "cust-1", name: "Ada" },
          knowledge: { query: "refund", chunkCount: 3, contextText: "policy" },
        }),
        recentMessages: [{ role: "user", content: "Hi" }],
        recentToolKeys: ["search_customer"],
      },
      createContext({ tenantId: "tenant-1", actorId: "user-1", permissions: ["ai.read"] }),
    );

    assert.equal(memory.entity.customerId, "cust-1");
    assert.equal(memory.knowledge.chunkCount, 3);
    assert.equal(memory.conversation.recentMessageCount, 1);
    assert.deepEqual(memory.action.recentToolKeys, ["search_customer"]);
  });

  it("caches and invalidates tenant context", async () => {
    const cache = createRuntimeContextCache();
    const key = cache.buildKey({ tenantId: "tenant-1", conversationId: "conv-1" });
    await cache.setContext(key, {
      assembled: Object.freeze({ customer: { id: "cust-1" } }),
      memory: Object.freeze({
        conversation: { conversationId: "conv-1", recentMessageCount: 0 },
        entity: {},
        knowledge: { chunkCount: 0 },
        action: { recentToolKeys: [] },
        session: { correlationId: "corr-1" },
      }),
      cachedAt: new Date().toISOString(),
    });

    const cached = await cache.getContext(key);
    assert.ok(cached?.assembled.customer);

    await cache.invalidateTenant("tenant-1");
    assert.equal(await cache.getContext(key), null);
  });

  it("invalidates context cache on platform events", async () => {
    const cache = createRuntimeContextCache();
    const key = cache.buildKey({ tenantId: "tenant-1", conversationId: "conv-1" });
    await cache.setContext(key, {
      assembled: Object.freeze({}),
      memory: Object.freeze({
        conversation: { conversationId: "conv-1", recentMessageCount: 0 },
        entity: {},
        knowledge: { chunkCount: 0 },
        action: { recentToolKeys: [] },
        session: { correlationId: "corr-1" },
      }),
      cachedAt: new Date().toISOString(),
    });

    const subscriber = createAIRuntimeContextSubscriber({ contextCache: cache });
    await subscriber.handle({
      eventId: "evt-1",
      eventType: "CustomerUpdated",
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      payload: { customerId: "cust-1", changedFields: ["phone"], patch: { phone: "+966501234567" } },
      context: {
        tenantId: "tenant-1",
        correlationId: "corr-1",
        sourceModule: "crm",
        actorType: "user",
      },
    } as never);

    assert.equal(await cache.getContext(key), null);
  });

  it("assembles extended context with company, flags, and licensing", async () => {
    const registry = createApplicationLayerRegistry({
      useMockPorts: true,
      eventBus: createConfiguredPlatformEventBus([], { awaitSubscribers: false }),
    });
    const ctx = createContext({
      tenantId: "tenant-1",
      actorId: "user-1",
      permissions: ["ai.read"],
    });
    const result = await registry.getServices().context.assemble(
      { customerId: "cust-1", knowledgeQuery: "policy", includeCompany: true, includeFeatureFlags: true, includeLicensing: true },
      ctx,
    );
    assert.ok(result.data.company);
    assert.ok(result.data.featureFlags);
    assert.ok(result.data.licensing);
    assert.ok(result.data.realtime);
  });
});
