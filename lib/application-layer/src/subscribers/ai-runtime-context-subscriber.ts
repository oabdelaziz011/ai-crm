import type { PlatformEvent, PlatformEventType } from "@workspace/platform-events";
import type { PlatformEventSubscriber } from "@workspace/platform-events";
import type { RuntimeContextCache } from "../cache/runtime-context-cache.js";

export type AIRuntimeContextSubscriberDeps = Readonly<{
  contextCache: RuntimeContextCache;
  invalidateRuntime?: (tenantId: string, entityType?: string, entityId?: string) => Promise<void>;
}>;

const CONTEXT_REFRESH_EVENTS: PlatformEventType[] = [
  "BookingCompleted",
  "PaymentCollected",
  "LeadConverted",
  "CustomerUpdated",
  "WorkflowCompleted",
  "TaskCompleted",
  "KnowledgeUpdated",
  "ConfigurationPublished",
  "FeatureFlagUpdated",
  "LicenseChanged",
];

/** Invalidates AI runtime context cache when platform state changes. */
export function createAIRuntimeContextSubscriber(
  deps: AIRuntimeContextSubscriberDeps,
): PlatformEventSubscriber {
  return Object.freeze({
    subscriberId: "ai-runtime-context-refresh",
    subscribedEvents: CONTEXT_REFRESH_EVENTS,
    async handle(event: PlatformEvent): Promise<void> {
      const tenantId = event.tenantId;
      await deps.contextCache.invalidateTenant(tenantId);
      if (deps.invalidateRuntime) {
        const entityId =
          typeof event.payload === "object" && event.payload && "customerId" in event.payload
            ? String((event.payload as { customerId?: string }).customerId ?? "")
            : undefined;
        await deps.invalidateRuntime(tenantId, event.entityType ?? undefined, entityId || undefined);
      }
    },
  });
}
