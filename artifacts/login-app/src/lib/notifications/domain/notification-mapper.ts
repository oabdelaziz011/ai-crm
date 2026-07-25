import type {
  Notification,
  NotificationCategory,
  NotificationChannel,
  NotificationEvent,
  NotificationPriority,
  NotificationStatus,
  NotificationVisualType,
} from "@/lib/notifications/types";

type NotificationRow = {
  id: string;
  company_id: string;
  user_id: string | null;
  title: string;
  message: string;
  type: NotificationVisualType;
  category: string;
  is_read: boolean;
  archived_at: string | null;
  priority: NotificationPriority | null;
  event_type: string | null;
  channel: NotificationChannel | null;
  delivery_status: NotificationStatus | null;
  created_at: string;
};

const EVENT_TO_LEGACY_CATEGORY: Partial<Record<NotificationEvent, NotificationCategory>> = {
  appointment_created: "booking",
  appointment_updated: "booking",
  appointment_cancelled: "booking",
  customer_created: "customer",
  invoice_created: "invoice",
  payment_received: "payment",
  generic_system: "system",
};

export function mapRowToNotification(row: NotificationRow): Notification {
  const event = (row.event_type as NotificationEvent | null) ?? null;
  const status: NotificationStatus = row.archived_at
    ? "archived"
    : row.is_read
      ? "read"
      : (row.delivery_status ?? "delivered");

  return {
    id: row.id,
    companyId: row.company_id,
    recipient: {
      userId: row.user_id,
      companyId: row.company_id,
    },
    templateKey: row.title,
    titleKey: row.title,
    messagePayload: row.message,
    event,
    status,
    priority: row.priority ?? "normal",
    channel: row.channel ?? "in_app",
    visualType: row.type,
    category: (row.category as NotificationCategory) ?? "system",
    isRead: row.is_read,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

export function mapNotificationToInsertRow(input: {
  companyId: string;
  userId: string | null;
  templateKey: string;
  messagePayload: string;
  event: NotificationEvent;
  priority: NotificationPriority;
  channel: NotificationChannel;
  visualType: NotificationVisualType;
  category: NotificationCategory;
}): Record<string, unknown> {
  return {
    company_id: input.companyId,
    user_id: input.userId,
    title: input.templateKey,
    message: input.messagePayload,
    type: input.visualType,
    category: input.category,
    is_read: false,
    priority: input.priority,
    event_type: input.event,
    channel: input.channel,
    delivery_status: "delivered",
    archived_at: null,
  };
}

export function resolveCategoryForEvent(event: NotificationEvent): NotificationCategory {
  return EVENT_TO_LEGACY_CATEGORY[event] ?? "system";
}

/** Backward-compatible shape for legacy UI consumers. */
export function notificationToLegacyItem(notification: Notification): {
  id: string;
  company_id: string;
  user_id: string | null;
  title_key: string;
  message: string;
  type: NotificationVisualType;
  category: string;
  is_read: boolean;
  created_at: string;
} {
  return {
    id: notification.id,
    company_id: notification.companyId,
    user_id: notification.recipient.userId,
    title_key: notification.titleKey,
    message: notification.messagePayload,
    type: notification.visualType,
    category: notification.category,
    is_read: notification.isRead,
    created_at: notification.createdAt,
  };
}
