import type {
  CreateNotificationInput,
  Notification,
  NotificationChannel,
  NotificationEvent,
  NotificationListFilter,
  NotificationPage,
  NotificationPreference,
  NotificationPriority,
  NotificationQueueItem,
  NotificationRecipient,
} from "@/lib/notifications/types";
import { resolveCategoryForEvent } from "@/lib/notifications/domain/notification-mapper";
import { NotificationRepository } from "@/lib/notifications/repositories/notification-repository";
import { NotificationPreferenceRepository } from "@/lib/notifications/repositories/notification-preference-repository";
import { NotificationQueueRepository } from "@/lib/notifications/repositories/notification-queue-repository";
import { notificationTemplateRegistry } from "@/lib/notifications/templates/template-registry";
import { readMutedEvents } from "@/lib/notifications/preference-settings";

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
};

export class NotificationPreferenceService {
  constructor(private readonly repository: NotificationPreferenceRepository) {}

  async list(companyId: string, userId?: string | null): Promise<NotificationPreference[]> {
    return this.repository.list(companyId, userId);
  }

  shouldDeliver(
    preferences: NotificationPreference[],
    recipient: NotificationRecipient,
    channel: NotificationChannel,
    priority: NotificationPriority,
    event?: NotificationEvent | null,
  ): boolean {
    const relevant = preferences.filter(
      (pref) =>
        (pref.scope === "tenant" || pref.userId === recipient.userId) &&
        (pref.channel === null || pref.channel === channel),
    );

    // Mute only when a preference targets this channel (channel=null is the event-settings bag).
    if (relevant.some((pref) => pref.muted && pref.channel === channel)) {
      return false;
    }

    const minPriority = relevant.find((pref) => pref.minPriority)?.minPriority;
    if (minPriority && PRIORITY_RANK[priority] < PRIORITY_RANK[minPriority]) {
      return false;
    }

    if (event) {
      const mutedEvents = new Set(readMutedEvents(preferences, recipient.userId));
      if (mutedEvents.has(event)) {
        return false;
      }
    }

    return true;
  }
}

export class NotificationQueueService {
  constructor(private readonly repository: NotificationQueueRepository) {}

  async enqueueDelivery(input: {
    companyId: string;
    notificationId: string;
    channel: NotificationChannel;
    scheduledAt?: string;
    payload?: Record<string, unknown>;
  }): Promise<NotificationQueueItem> {
    return this.repository.enqueue({
      companyId: input.companyId,
      notificationId: input.notificationId,
      channel: input.channel,
      scheduledAt: input.scheduledAt,
      payload: input.payload,
    });
  }

  async listPending(companyId: string): Promise<NotificationQueueItem[]> {
    return this.repository.listPending(companyId);
  }

  /** Future-ready processor stub — does not dispatch to external providers. */
  async markProcessing(companyId: string, queueId: string): Promise<void> {
    await this.repository.updateStatus(companyId, queueId, "processing");
  }

  async markCompleted(companyId: string, queueId: string): Promise<void> {
    await this.repository.updateStatus(companyId, queueId, "completed", {
      processedAt: new Date().toISOString(),
      lastError: null,
    });
  }

  async markFailed(companyId: string, queueId: string, error: string, retryCount: number): Promise<void> {
    await this.repository.updateStatus(companyId, queueId, "failed", {
      retryCount,
      lastError: error,
    });
  }
}

export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly queueService: NotificationQueueService,
    private readonly preferenceService: NotificationPreferenceService,
  ) {}

  list(companyId: string, page: number, filter?: NotificationListFilter, pageSize?: number): Promise<NotificationPage> {
    return this.repository.list({ companyId, page, pageSize, filter });
  }

  getById(companyId: string, id: string): Promise<Notification | null> {
    return this.repository.getById(companyId, id);
  }

  getUnreadCount(companyId: string): Promise<number> {
    return this.repository.getUnreadCount(companyId);
  }

  markRead(companyId: string, id: string): Promise<void> {
    return this.repository.markRead(companyId, id);
  }

  markUnread(companyId: string, id: string): Promise<void> {
    return this.repository.markUnread(companyId, id);
  }

  markAllRead(companyId: string): Promise<void> {
    return this.repository.markAllRead(companyId);
  }

  markManyRead(companyId: string, ids: string[]): Promise<void> {
    return this.repository.markManyRead(companyId, ids);
  }

  archive(companyId: string, id: string): Promise<void> {
    return this.repository.archive(companyId, id);
  }

  async createNotification(input: CreateNotificationInput): Promise<Notification[]> {
    const template = notificationTemplateRegistry.resolve(input.event);
    if (!template) {
      throw new Error(`Unknown notification event: ${input.event}`);
    }

    const priority = input.priority ?? template.defaultPriority;
    const channels = input.channels ?? [template.defaultChannel];
    const params = input.params ?? {};
    const messagePayload = JSON.stringify({
      messageKey: template.messageKey,
      params,
    });

    const preferences = await this.preferenceService.list(input.companyId);
    const created: Notification[] = [];

    for (const recipient of input.recipients) {
      for (const channel of channels) {
        if (
          !this.preferenceService.shouldDeliver(
            preferences,
            recipient,
            channel,
            priority,
            input.event,
          )
        ) {
          continue;
        }

        const row = this.repository.buildInsertRow({
          companyId: input.companyId,
          userId: recipient.userId ?? input.userId ?? null,
          templateKey: template.titleKey,
          messagePayload,
          event: input.event,
          priority,
          channel,
          visualType: template.visualType,
          category: resolveCategoryForEvent(input.event),
        });

        const notification = await this.repository.create(row);
        created.push(notification);

        const queueItem = await this.queueService.enqueueDelivery({
          companyId: input.companyId,
          notificationId: notification.id,
          channel,
          payload: { event: input.event, params },
        });

        if (channel === "in_app") {
          await this.queueService.markCompleted(input.companyId, queueItem.id);
        }
      }
    }

    return created;
  }
}
