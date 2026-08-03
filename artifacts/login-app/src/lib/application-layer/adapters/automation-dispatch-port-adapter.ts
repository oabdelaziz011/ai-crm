import type { PlatformEvent } from "@workspace/platform-events";
import type { AutomationDispatchPort } from "@workspace/application-layer";
import { PLATFORM_EVENT_AUTOMATION_MAP } from "@workspace/application-layer";
import { dispatchAutomationEvent } from "@/lib/automation";

export function createLoginAppAutomationDispatchPort(): AutomationDispatchPort {
  return {
    async dispatchFromPlatformEvent(envelope: PlatformEvent) {
      const workflowName = PLATFORM_EVENT_AUTOMATION_MAP[envelope.eventType];
      if (!workflowName) return;

      const payload = envelope.payload as Record<string, unknown>;
      await dispatchAutomationEvent({
        name: workflowName,
        companyId: envelope.tenantId,
        params: {
          eventType: envelope.eventType,
          correlationId: envelope.correlationId,
          entityType: envelope.entityType ?? "",
          entityId: envelope.entityId ?? "",
          ...payload,
        },
        userId: envelope.actorId,
      });
    },
  };
}
