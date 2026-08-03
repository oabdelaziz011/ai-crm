import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlatformEventSubscriber, PlatformEventType } from "@workspace/platform-events";
import {
  mapPlatformEventToNotificationInput,
  PLATFORM_NOTIFICATION_EVENT_TYPES,
} from "@workspace/application-layer";
import { createLoginAppNotificationWritePort } from "./adapters/notification-port-adapters.js";

const processedKeys = new Set<string>();

/** Platform Event Bus subscriber — persists notifications via NotificationWritePort only. */
export function createPlatformNotificationSubscriber(
  client: SupabaseClient,
): PlatformEventSubscriber {
  return {
    subscriberId: "notification",
    subscribedEvents: [...PLATFORM_NOTIFICATION_EVENT_TYPES] as PlatformEventType[],

    async handle(envelope) {
      const idempotencyKey = `${envelope.correlationId}:${envelope.eventType}`;
      if (processedKeys.has(idempotencyKey)) return;
      processedKeys.add(idempotencyKey);

      const input = mapPlatformEventToNotificationInput(envelope);
      if (!input) return;

      const writePort = createLoginAppNotificationWritePort(client, {
        companyId: envelope.tenantId,
        actorUserId: envelope.actorId ?? "system",
        isSuperAdmin: true,
        hasPermission: () => true,
      });

      await writePort.create(input);
    },
  };
}
