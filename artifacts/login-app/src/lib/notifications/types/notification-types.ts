import type {
  NotificationCategory,
  NotificationChannel,
  NotificationEvent,
  NotificationPriority,
  NotificationStatus,
  NotificationVisualType,
} from "@/lib/notifications/types/notification-enums";

/** Domain recipient — no provider-specific fields. */
export type NotificationRecipient = {
  userId: string | null;
  companyId: string;
};

/** In-app notification aggregate. */
export type Notification = {
  id: string;
  companyId: string;
  recipient: NotificationRecipient;
  templateKey: string;
  titleKey: string;
  messagePayload: string;
  event: NotificationEvent | null;
  status: NotificationStatus;
  priority: NotificationPriority;
  channel: NotificationChannel;
  visualType: NotificationVisualType;
  category: NotificationCategory;
  isRead: boolean;
  archivedAt: string | null;
  createdAt: string;
};

export type NotificationTemplate = {
  key: string;
  event: NotificationEvent;
  titleKey: string;
  messageKey: string;
  defaultPriority: NotificationPriority;
  defaultChannel: NotificationChannel;
  category: NotificationCategory;
  visualType: NotificationVisualType;
};

export type NotificationPreference = {
  id: string;
  companyId: string;
  userId: string | null;
  scope: "user" | "tenant";
  channel: NotificationChannel | null;
  minPriority: NotificationPriority | null;
  muted: boolean;
  workingHours: NotificationWorkingHours | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationWorkingHours = {
  timezone: string;
  startHour: number;
  endHour: number;
  days: number[];
  /**
   * Optional event mute list (stored in existing working_hours jsonb).
   * Used by staff notification settings — no separate column required.
   */
  mutedEvents?: NotificationEvent[];
};

export type NotificationQueueItem = {
  id: string;
  companyId: string;
  notificationId: string | null;
  channel: NotificationChannel;
  status: "pending" | "processing" | "completed" | "failed";
  retryCount: number;
  scheduledAt: string;
  processedAt: string | null;
  lastError: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreateNotificationInput = {
  companyId: string;
  event: NotificationEvent;
  recipients: NotificationRecipient[];
  params?: Record<string, string>;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
  userId?: string | null;
};

export type NotificationListFilter = {
  unreadOnly?: boolean;
  priority?: NotificationPriority | "all";
  event?: NotificationEvent | "all";
  includeArchived?: boolean;
  sort?: "newest" | "oldest";
};

export type NotificationPage = {
  items: Notification[];
  total: number;
  pageSize: number;
  page: number;
  hasMore: boolean;
};
