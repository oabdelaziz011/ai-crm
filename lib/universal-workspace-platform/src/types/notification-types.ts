export type NotificationPriority = "low" | "normal" | "high" | "urgent";
export type NotificationCategory =
  | "vip"
  | "payment"
  | "invoice"
  | "employee"
  | "task"
  | "room"
  | "ai"
  | "workflow";

export type WorkspaceNotification = {
  id: string;
  category: NotificationCategory;
  title: string;
  message: string;
  priority: NotificationPriority;
  read: boolean;
  createdAt: string;
  actionKey?: string;
  entityType?: string;
  entityId?: string;
};

export function groupNotificationsByPriority(
  notifications: WorkspaceNotification[],
): Record<NotificationPriority, WorkspaceNotification[]> {
  const groups: Record<NotificationPriority, WorkspaceNotification[]> = {
    urgent: [],
    high: [],
    normal: [],
    low: [],
  };
  for (const n of notifications) {
    groups[n.priority].push(n);
  }
  return groups;
}
