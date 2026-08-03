import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createApplicationLayerRegistry,
  createContext,
  createProductionSubscribers,
  createAIRuntimeContextSubscriber,
  createRuntimeContextCache,
  type ProductionSubscriberDeps,
} from "@workspace/application-layer";
import { createConfiguredPlatformEventBus, type PlatformEventBus } from "@workspace/platform-events";
import { supabase } from "@/lib/supabase";
import { createLoginAppApplicationPorts } from "./create-login-app-application-ports.js";
import {
  createSupabaseAuditTrailStore,
  createSupabaseCorrelationStore,
  createSupabaseDeadLetterQueue,
  createSupabaseEventTelemetry,
  createSupabaseIdempotencyStore,
  createSupabaseTimelineStore,
} from "./adapters/platform-event-store-adapters.js";
import { createLoginAppReactiveSignalPort } from "./adapters/reactive-signal-port-adapter.js";
import { createLoginAppAutomationDispatchPort } from "./adapters/automation-dispatch-port-adapter.js";
import { createIntegrationEventSubscriber } from "./adapters/integration-event-subscriber.js";

let sharedBus: PlatformEventBus | null = null;

/** Shared production event bus for legacy bridge paths (billing, lead factories). */
export function getLoginAppPlatformEventBus(client: SupabaseClient = supabase): PlatformEventBus {
  if (sharedBus) return sharedBus;

  const ports = createLoginAppApplicationPorts(
    { companyId: "system", actorUserId: "system", isSuperAdmin: true, hasPermission: () => true },
    client,
  );
  const reactive = createLoginAppReactiveSignalPort(client);
  const automation = createLoginAppAutomationDispatchPort();

  const tempRegistry = createApplicationLayerRegistry({
    useMockPorts: false,
    ports,
    eventBus: createConfiguredPlatformEventBus([], { awaitSubscribers: false }),
  });

  const deps: ProductionSubscriberDeps = {
    getServices: () => tempRegistry.getServices(),
    ports,
    reactive,
    automation,
    buildSystemContext: (envelope) =>
      createContext({
        tenantId: envelope.tenantId,
        actorId: envelope.actorId ?? "system",
        actorType: "system",
        permissions: ["*"],
        correlationId: envelope.correlationId,
      }),
  };

  const contextCache = createRuntimeContextCache();

  sharedBus = createConfiguredPlatformEventBus(
    [
      ...createProductionSubscribers(deps),
      createIntegrationEventSubscriber(),
      createAIRuntimeContextSubscriber({ contextCache }),
    ],
    {
    auditStore: createSupabaseAuditTrailStore(client),
    timelineStore: createSupabaseTimelineStore(client),
    correlationStore: createSupabaseCorrelationStore(client),
    idempotencyStore: createSupabaseIdempotencyStore(client),
    deadLetterQueue: createSupabaseDeadLetterQueue(client),
    telemetry: createSupabaseEventTelemetry(client),
    awaitSubscribers: false,
  });

  return sharedBus;
}
