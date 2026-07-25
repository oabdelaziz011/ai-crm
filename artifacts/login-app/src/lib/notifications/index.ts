import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { NotificationRepository } from "@/lib/notifications/repositories/notification-repository";
import { NotificationPreferenceRepository } from "@/lib/notifications/repositories/notification-preference-repository";
import { NotificationQueueRepository } from "@/lib/notifications/repositories/notification-queue-repository";
import {
  NotificationPreferenceService,
  NotificationQueueService,
  NotificationService,
} from "@/lib/notifications/services/notification-service";

export function createNotificationServices(client: SupabaseClient = supabase) {
  const notificationRepository = new NotificationRepository(client);
  const queueRepository = new NotificationQueueRepository(client);
  const preferenceRepository = new NotificationPreferenceRepository(client);

  const preferenceService = new NotificationPreferenceService(preferenceRepository);
  const queueService = new NotificationQueueService(queueRepository);

  return {
    repository: notificationRepository,
    queueRepository,
    preferenceRepository,
    preferenceService,
    queueService,
    notifications: new NotificationService(
      notificationRepository,
      queueService,
      preferenceService,
    ),
  };
}

export type NotificationServices = ReturnType<typeof createNotificationServices>;

let defaultNotificationServices: NotificationServices | null = null;

export function getNotificationServices(): NotificationServices {
  if (!defaultNotificationServices) {
    defaultNotificationServices = createNotificationServices();
  }
  return defaultNotificationServices;
}

export * from "@/lib/notifications/types";
export { notificationTemplateRegistry } from "@/lib/notifications/templates/template-registry";
export { notificationToLegacyItem } from "@/lib/notifications/domain/notification-mapper";
export {
  notificationsListKey,
  notificationsInfiniteKey,
  notificationsUnreadKey,
  notificationPreferencesKey,
} from "@/lib/notifications/cache/notification-query-keys";
export { invalidateNotificationQueries } from "@/lib/notifications/cache/invalidate-notification-queries";
