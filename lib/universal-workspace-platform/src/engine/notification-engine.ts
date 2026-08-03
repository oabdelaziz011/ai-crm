import type { WorkspaceNotification } from "../types/notification-types.js";
import { MOCK_NOTIFICATIONS } from "../mock/mock-notifications.js";

export class NotificationEngine {
  private notifications: WorkspaceNotification[];

  constructor(seed?: WorkspaceNotification[]) {
    this.notifications = seed ?? [...MOCK_NOTIFICATIONS];
  }

  list(filter?: { unreadOnly?: boolean; category?: string }): WorkspaceNotification[] {
    let items = [...this.notifications];
    if (filter?.unreadOnly) items = items.filter((n) => !n.read);
    if (filter?.category) items = items.filter((n) => n.category === filter.category);
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  unreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  markRead(id: string): void {
    this.notifications = this.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
  }

  markAllRead(): void {
    this.notifications = this.notifications.map((n) => ({ ...n, read: true }));
  }
}

export const notificationEngine = new NotificationEngine();
