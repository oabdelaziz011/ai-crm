import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NotificationReadPort,
  NotificationWritePort,
  NotificationReadModel,
  NotificationCreateInput,
  NotificationListFilter,
} from "@workspace/application-layer";
import { getNotificationServices } from "@/lib/notifications";
import type { Notification, NotificationEvent, NotificationPriority } from "@/lib/notifications/types";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

const EVENT_TYPE_MAP: Record<string, NotificationEvent> = {
  customer_created: "customer_created",
  appointment_created: "appointment_created",
  appointment_updated: "appointment_updated",
  appointment_cancelled: "appointment_cancelled",
  invoice_created: "invoice_created",
  payment_received: "payment_received",
  generic_system: "generic_system",
};

function mapDomainToReadModel(n: Notification): NotificationReadModel {
  let metadata: Record<string, string> | undefined;
  try {
    const parsed = JSON.parse(n.messagePayload) as Record<string, unknown>;
    metadata = Object.fromEntries(
      Object.entries(parsed.params ?? parsed).filter(([, value]) => typeof value === "string") as [string, string][],
    );
  } catch {
    metadata = undefined;
  }

  return Object.freeze({
    id: n.id,
    tenantId: n.companyId,
    recipientUserId: n.recipient.userId,
    title: n.titleKey,
    message: n.messagePayload,
    category: n.category,
    priority: n.priority,
    severity: metadata?.severity ?? (n.visualType === "warning" ? "warning" : n.visualType === "error" ? "critical" : "information"),
    read: n.isRead,
    createdAt: n.createdAt,
    readAt: n.isRead ? n.createdAt : undefined,
    correlationId: metadata?.correlationId,
    entityType: metadata?.entityType,
    entityId: metadata?.entityId,
    navigationTarget: metadata?.navigationTarget,
    metadata,
  });
}

function canReadNotifications(ctx: LoginAppPortContext): boolean {
  return ctx.isSuperAdmin || ctx.hasPermission("notification.read") || ctx.hasPermission("notifications.view");
}

function canWriteNotifications(ctx: LoginAppPortContext): boolean {
  return ctx.isSuperAdmin || ctx.hasPermission("notification.write") || ctx.hasPermission("notifications.manage");
}

export function createLoginAppNotificationReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): NotificationReadPort {
  const { notifications } = getNotificationServices();

  return {
    async list(tenantId, userId, filter?: NotificationListFilter) {
      if (tenantId !== ctx.companyId || !canReadNotifications(ctx)) {
        return Object.freeze({ items: Object.freeze([]), total: 0, page: 1, pageSize: 20, hasMore: false });
      }

      const page = await notifications.list(
        tenantId,
        filter?.page ?? 1,
        {
          unreadOnly: filter?.unreadOnly,
          priority: (filter?.priority as NotificationPriority | "all" | undefined) ?? "all",
          event: (filter?.eventType as NotificationEvent | "all" | undefined) ?? "all",
          includeArchived: filter?.includeArchived,
        },
        filter?.pageSize ?? filter?.limit ?? 20,
      );

      let items = page.items.map((item) => mapDomainToReadModel(item));

      if (filter?.category && filter.category !== "all") {
        items = items.filter((item) => item.category === filter.category);
      }
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        items = items.filter((item) => item.title.toLowerCase().includes(q) || item.message.toLowerCase().includes(q));
      }
      if (userId) {
        items = items.filter((item) => !item.recipientUserId || item.recipientUserId === userId);
      }

      return Object.freeze({
        items: Object.freeze(items),
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
        hasMore: page.hasMore,
      });
    },

    async getUnreadCount(tenantId, _userId) {
      if (tenantId !== ctx.companyId || !canReadNotifications(ctx)) return 0;
      return notifications.getUnreadCount(tenantId);
    },
  };
}

export function createLoginAppNotificationWritePort(
  _client: SupabaseClient,
  ctx: LoginAppPortContext,
): NotificationWritePort {
  const { notifications } = getNotificationServices();

  return {
    async create(input: NotificationCreateInput) {
      if (input.tenantId !== ctx.companyId && !ctx.isSuperAdmin) {
        throw new Error("Permission denied");
      }

      const mappedEvent = EVENT_TYPE_MAP[input.eventType] ?? "generic_system";
      const messagePayload = JSON.stringify({
        messageKey: "notifications.platform.templates.genericSystem.message",
        params: {
          title: input.title,
          body: input.body,
          correlationId: input.correlationId,
          entityType: input.entityType ?? "",
          entityId: input.entityId ?? "",
          navigationTarget: input.navigationTarget ?? "",
          severity: input.severity,
          recipientRole: input.recipientRole ?? "",
          ...(input.metadata ?? {}),
        },
      });

      const created = await notifications.createNotification({
        companyId: input.tenantId,
        event: mappedEvent,
        recipients: [{ companyId: input.tenantId, userId: input.recipientUserId ?? null }],
        userId: input.recipientUserId ?? null,
        priority: (input.priority as NotificationPriority) ?? "normal",
        channels: ["in_app"],
        params: {
          title: input.title,
          body: input.body,
        },
      });

      const first = created[0];
      if (!first) {
        throw new Error("Notification creation failed");
      }

      return Object.freeze({
        id: first.id,
        tenantId: first.companyId,
        recipientUserId: first.recipient.userId,
        title: input.title,
        message: messagePayload,
        category: first.category,
        priority: first.priority,
        severity: input.severity,
        read: false,
        createdAt: first.createdAt,
        correlationId: input.correlationId,
        entityType: input.entityType,
        entityId: input.entityId,
        navigationTarget: input.navigationTarget,
        metadata: input.metadata,
      });
    },

    async markRead(tenantId, userId, notificationId) {
      if (tenantId !== ctx.companyId || !canWriteNotifications(ctx)) throw new Error("Permission denied");
      void userId;
      await notifications.markRead(tenantId, notificationId);
    },

    async markUnread(tenantId, userId, notificationId) {
      if (tenantId !== ctx.companyId || !canWriteNotifications(ctx)) throw new Error("Permission denied");
      void userId;
      await notifications.markUnread(tenantId, notificationId);
    },

    async markAllRead(tenantId, userId) {
      if (tenantId !== ctx.companyId || !canWriteNotifications(ctx)) throw new Error("Permission denied");
      void userId;
      await notifications.markAllRead(tenantId);
    },

    async archive(tenantId, userId, notificationId) {
      if (tenantId !== ctx.companyId || !canWriteNotifications(ctx)) throw new Error("Permission denied");
      void userId;
      await notifications.archive(tenantId, notificationId);
    },
  };
}
